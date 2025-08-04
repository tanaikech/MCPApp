/**
 * GitHub  https://github.com/tanaikech/MCPApp<br>
 * Library name
 * @type {string}
 * @const {string}
 * @readonly
 */
var appName = "MCPApp";

/**
 * Main Class
 * 
 * @param {Object} object Object using this script.
 * @param {Boolean} object.log Default is false. When this is true, the log between MCP client and MCP server is stored to Google Sheets.
 * @param {String} object.spreadsheetId Spreadsheet ID. Log is storead to "Log" sheet of this spreadsheet.
 * @returns {MCPApp}
 */
function mcpApp(object) {
  this.mcpApp = new MCPApp(object);
  return this.mcpApp;
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
function setServices(services) {
  const { lock, properties } = services;
  if (lock) {
    /** @private */
    this.mcpApp.lock = lock;
  }
  if (properties) {
    /** @private */
    this.mcpApp.properties = properties;
  }
  return this.mcpApp;
}

/**
* ### Description
* Method for the MCP server.
*
* @param {Object} object Object using this script.
* @param {Object} object.eventObject Event object from doPost function.
* @param {Object} object.serverResponse Object for the server response.
* @param {Object} object.functions Functions for using at tools/call.
* @param {Array} object.items Items including serverResponse and functions.
* @return {ContentService.TextOutput}
*/
function server(object) {
  return this.mcpApp.server(object);
}

/**
* ### Description
* Method for preparing the MCP client.
*
* @param {Object} object Object using this script.
* @param {String} object.apiKey API key for using Gemini API.
* @param {String} object.prompt Prompt
* @param {Array} object.mcpServerUrls MCP server URLs.
* @param {Boolean} object.batchProcess The default is false. When this is true, the batch process is used from client to servers.
* @param {Object} object.functions This is custom function at the client side.
* @param {Array} object.history
* @return {MCPApp}
*/
function client(object) {
  this.mcpApp.clientObject = object;
  return this.mcpApp.client(object);
}

/**
* ### Description
* Main method for the MCP client.
*
* @return {Object}
*/
function callMCPServers() {
  return this.mcpApp.callMCPServers(this.mcpApp.clientObject);
}

/**
 * ### Description
 * Return HtmlService.HtmlOutput for UI of MCP client.
 *
 * @return {HtmlService.HtmlOutput}
 */
function getClientIndex() {
  return HtmlService.createHtmlOutputFromFile("index_client").setTitle("MCP client from MCPApp");
}
