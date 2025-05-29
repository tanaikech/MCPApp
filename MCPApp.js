/**
 * Class object for MCP.
 * Author: Kanshi Tanaike
 * version 1.0.2
 * @class
 */
class MCPApp {

  /**
  * @param {Object} object Object using this script.
  * @param {String} object.accessKey Default is no value. This key is used for accessing the Web Apps.
  * @param {Boolean} object.log Default is false. When this is true, the log between MCP client and MCP server is stored to Google Sheets.
  * @param {String} object.spreadsheetId Spreadsheet ID. Log is storead to "Log" sheet of this spreadsheet.
  * @return {ContentService.TextOutput}
  */
  constructor(object) {
    const { accessKey = null, log = false, spreadsheetId } = object;

    /** @private */
    this.accessKey = accessKey;

    /** 
     * ref: https://modelcontextprotocol.io/docs/concepts/architecture#error-handling
     * @private
     */
    this.ErrorCode = {
      // Standard JSON-RPC error codes
      ParseError: -32700,
      InvalidRequest: -32600,
      MethodNotFound: -32601,
      InvalidParams: -32602,
      InternalError: -32603,
    }

    /** @private */
    this.date = new Date();

    /** @private */
    this.log = log;

    if (this.log) {
      const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.create("Log_MCPApp");

      /** @private */
      this.sheet = ss.getSheetByName("log") || ss.insertSheet("log");
    }

    /** @private */
    this.values = [];

    this.lock = this.lock || LockService.getScriptLock();

    this.properties = this.properties || PropertiesService.getScriptProperties();
  }

  /**
  * ### Description
  * Set services depend on each script. For example, those are LockService and PropertiesService.
  * For example, if you don't set these properties, you cannot use this as a library.
  * If you want to use MCPApp as a library, please set the services.
  *
  * In the current stage, only LockService is used and PropertiesService is not used in MCPApp. PropertiesService is for the future update.
  *
  * @param {Object} services Array including the services you want to use.
  * @params {LockService.Lock} services.lock One of LockService.getDocumentLock(), LockService.getScriptLock(), or LockService.getUserLock(). Default is LockService.getScriptLock().
  * @params {PropertiesService.Properties} services.properties  One of PropertiesService.getDocumentProperties(), PropertiesService.getScriptProperties(), or PropertiesService.getUserProperties(). Default is PropertiesService.getScriptProperties().
  * @return {MCPApp}
  */
  setServices(services) {
    const { lock, properties } = services;
    if (lock && lock.toString() == "Lock") {
      this.lock = lock;
    }
    if (properties && lock.toString() == "Properties") {
      this.properties = properties;
    }
    return this;
  }

  /**
  * ### Description
  * Method for the MCP server.
  *
  * @param {Object} object Object using this script.
  * @param {Object} object.eventObject Event object from doPost function.
  * @param {Object} object.serverResponse Object for the server response.
  * @param {Object} object.functions Functions for using at tools/call.
  * @return {ContentService.TextOutput}
  */
  server(object) {
    this.errorProcess_(object);
    const lock = this.lock;
    if (lock.tryLock(350000)) {
      try {
        const res = this.createResponse_(object);
        if (this.log) {
          this.log_();
        }
        return res;
      } catch ({ stack }) {
        throw new Error(stack);
      } finally {
        lock.releaseLock();
      }
    } else {
      throw new Error("Timeout.");
    }
  }

  /**
  * ### Description
  * Check parameters.
  *
  * @param {Object} object Object using this script.
  * @return {void}
  * @private
  */
  errorProcess_(object) {
    if (!object.eventObject) {
      throw new Error("Please set event object from doPost.");
    }
    if (!object.serverResponse) {
      throw new Error("Please set your server object to MCP client.");
    }
  }

  /**
  * ### Description
  * Create the response to MCP client.
  *
  * @param {Object} object Object using this script.
  * @param {Object} object.eventObject Event object from doPost function.
  * @param {Object} object.serverResponse Object for the server response.
  * @param {Object} object.functions Functions for using at tools/call.
  * @return {ContentService.TextOutput}
  * @private
  */
  createResponse_(object) {
    const { eventObject, serverResponse, functions = {} } = object;
    const obj = this.parseObj_(eventObject);
    if (!obj.hasOwnProperty("method")) return null;
    const method = obj.method.toLowerCase();
    const id = obj.hasOwnProperty("id") ? obj.id : "No ID";
    this.values.push([this.date, method, id, "client --> server", JSON.stringify(obj)]);

    if (this.accessKey && eventObject.parameter.accessKey && eventObject.parameter.accessKey != this.accessKey) {
      this.values.push([this.date, method, id, "At server", "Invalid accessKey."]);
      return null;
    }

    if (serverResponse.hasOwnProperty(method)) {
      let retObj;
      try {
        retObj = serverResponse[method];
      } catch ({ stack }) {
        retObj = { "error": { "code": this.ErrorCode.InternalError, "message": stack }, "jsonrpc": "2.0" };
      }
      retObj.id = id;
      const data = JSON.stringify(retObj);
      this.values.push([this.date, method, id, "server --> client", data]);
      return ContentService.createTextOutput(data).setMimeType(ContentService.MimeType.JSON);
    } else if (functions && functions.hasOwnProperty(method)) {
      const m = functions[method];
      let retObj;
      try {
        if (obj.params && obj.params.name && m[obj.params.name]) {
          retObj = m[obj.params.name](obj.params?.arguments || null);
        } else if (obj.params && obj.params.uri && m[obj.params.uri]) {
          retObj = m[obj.params.uri]();
        } else {
          retObj = { "error": { "code": this.ErrorCode.InternalError, "message": `${method} didn't work.` }, "jsonrpc": "2.0" };
        }
      } catch ({ stack }) {
        retObj = { "error": { "code": this.ErrorCode.InternalError, "message": stack }, "jsonrpc": "2.0" };
      }
      retObj.id = id;
      const data = JSON.stringify(retObj);
      this.values.push([this.date, method, id, "server --> client", data]);
      return ContentService.createTextOutput(data).setMimeType(ContentService.MimeType.JSON);
    } else {
      this.values.push([this.date, method, id, "server --> client", `Return no value to ID ${id}.`]);
    }
    return null;
  }

  /**
  * ### Description
  * Parse object of the request body from doPost.
  *
  * @param {Object} e Object
  * @return {Object} object
  * @private
  */
  parseObj_(e) {
    let obj;
    if (e.postData.contents) {
      obj = JSON.parse(e.postData.contents);
    } else {

      // If the data from the MCP client is requested as the GET method, this part will be used.

    }
    return obj;
  }

  /**
  * ### Description
  * Store logs to Google Sheets.
  *
  * @return {void}
  * @private
  */
  log_() {
    this.values = this.values.map(r => r.map(c => typeof c == "string" ? c.substring(0, 40000) : c));
    this.sheet.getRange(this.sheet.getLastRow() + 1, 1, this.values.length, this.values[0].length).setValues(this.values);
  }
}
