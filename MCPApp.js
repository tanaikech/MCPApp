/**
 * Class object for MCP.
 * Author: Kanshi Tanaike
 * 
 * 20250806 14:14
 * version 2.0.8
 * @class
 */
class MCPApp {

  /**
  * @param {Object} object Object using this script.
  * @param {String} object.accessKey Default is no value. This key is used for accessing the Web Apps.
  * @param {Boolean} object.log Default is false. When this is true, the log between MCP client and MCP server is stored to Google Sheets.
  * @param {String} object.spreadsheetId Spreadsheet ID. Log is storead to "Log" sheet of this spreadsheet.
  * @param {Boolean} object.lock Default is true. As the default, the script is run with LockService. When this is false, the script is run without LockService.
  * @return {ContentService.TextOutput}
  */
  constructor(object = {}) {
    const { accessKey = null, log = false, spreadsheetId, lock = true } = object;

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
    this.protocolVersion = "2024-11-05"; // or "2025-03-26"

    /** @private */
    this.jsonrpc = "2.0";

    /** @private */
    this.date = new Date();

    /** @private */
    this.timezone = Session.getScriptTimeZone();

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

    /** @private */
    this.useLock = lock;

    /** @private */
    this.clientObject = {};

    // This is not still used. This is for the future update.
    // this.properties = this.properties || PropertiesService.getScriptProperties();
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

  /*****************************************************************************************************
  * For server
  */

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
  server(object = {}) {
    this.errorProcessForServer_(object);

    const obj = this.parseObj_(object.eventObject);
    const ki = ["initialize", "notifications/initialized", "tools/list", "prompts/list", "resources/list"];
    if (obj.method && ki.includes(obj.method)) {
      return this.lockedMethod_(object);
    }

    if (this.useLock === true) {
      return this.lockedMethod_(object);
    }

    try {
      return this.serverMain_(object);
    } catch ({ stack }) {
      throw new Error(stack);
    }
  }

  serverMain_(object) {
    const res = this.createResponse_(object);
    if (this.log) {
      this.log_();
    }
    return res;
  }

  lockedMethod_(object) {
    let res;
    const lock = this.lock;
    if (lock.tryLock(350000)) {
      try {
        res = this.serverMain_(object);
      } catch ({ stack }) {
        throw new Error(stack);
      } finally {
        lock.releaseLock();
      }
    } else {
      throw new Error("Timeout.");
    }
    return res;
  }

  /**
  * ### Description
  * Check parameters for server.
  *
  * @param {Object} object Object using this script.
  * @return {void}
  * @private
  */
  errorProcessForServer_(object) {
    if (!object.eventObject) {
      throw new Error("Please set event object from doPost.");
    }
    if (!object.serverResponse && !object.items) {
      throw new Error("Please set your server object to MCP client.");
    }
  }

  batchProcess_(object) {
    const { obj, serverResponse, functions } = object;
    if (!obj.hasOwnProperty("method")) return null;
    const method = obj.method.toLowerCase();
    const id = obj.hasOwnProperty("id") ? obj.id : "No ID";
    this.values.push([this.date, method, id, "client --> server", JSON.stringify(obj)]);

    if (serverResponse.hasOwnProperty(method)) {
      let retObj;
      if (serverResponse[method].result) {
        try {
          retObj = serverResponse[method];
          if (obj.params?.arguments && serverResponse[method].result.messages) {
            const args = obj.params.arguments;
            const msg = serverResponse[method].result.messages;
            Object.entries(args).forEach(([k, v]) => {
              msg.forEach(m => {
                if (m.content?.text) {
                  m.content.text = m.content.text.replace(`{{${k}}}`, v);
                }
              });
            });
          }
        } catch ({ stack }) {
          retObj = { "error": { "code": this.ErrorCode.InternalError, "message": stack }, "jsonrpc": this.jsonrpc };
        }
        retObj.id = id;
        const data = JSON.stringify(retObj);
        this.values.push([this.date, method, id, "server --> client", data]);
        return retObj;
      }

      const resName = obj.params?.name;
      const args = obj.params?.arguments;
      if (serverResponse[method][resName]) {
        retObj = serverResponse[method][resName];
        retObj.id = id;
        if (args && retObj.result?.messages) {
          const msg = retObj.result.messages;
          Object.entries(args).forEach(([k, v]) => {
            msg.forEach(m => {
              if (m.content?.text) {
                m.content.text = m.content.text.replace(`{{${k}}}`, v);
              }
            });
          });
        }
      } else {
        retObj = { "error": { "code": this.ErrorCode.InvalidParams, "message": `No prompt name of "${resName}".` }, "jsonrpc": this.jsonrpc };
      }

      const data = JSON.stringify(retObj);
      this.values.push([this.date, method, id, "server --> client", data]);
      return retObj;
    } else if (functions && functions.hasOwnProperty(method)) {
      const m = functions[method];
      let retObj;
      try {
        if (obj.params && obj.params.name && m[obj.params.name]) {
          retObj = m[obj.params.name](obj.params?.arguments || null);
          if (retObj.result && typeof retObj.result == "string" && Object.keys(retObj).length == 1) {
            retObj = {
              jsonrpc: "2.0",
              result: { content: [{ type: "text", text: retObj.result }], isError: false },
            };
          } else if (retObj.mcp) {
            retObj = retObj.mcp;
          }
        } else if (obj.params && obj.params.uri && m[obj.params.uri]) {
          retObj = m[obj.params.uri]();
        } else {
          retObj = { "error": { "code": this.ErrorCode.InternalError, "message": `${method} didn't work.` }, "jsonrpc": this.jsonrpc };
        }
      } catch ({ stack }) {
        retObj = { "error": { "code": this.ErrorCode.InternalError, "message": stack }, "jsonrpc": this.jsonrpc };
      }
      retObj.id = id;
      const data = JSON.stringify(retObj);
      this.values.push([this.date, method, id, "server --> client", data]);
      return retObj;
    } else {
      this.values.push([this.date, method, id, "server --> client", `Return no value to ID ${id}.`]);
    }
    return null;
  }

  /**
  * ### Description
  * Create the response to MCP client.
  *
  * @param {Object} object Object using this script.
  * @param {Object} object.eventObject Event object from doPost function.
  * @param {Object} object.serverResponse Object for the server response.
  * @param {Object} object.functions Functions for using at tools/call.
  * @param {Array} object.items Items including serverResponse and functions.
  * @return {ContentService.TextOutput}
  * @private
  */
  createResponse_(object) {
    let { eventObject, serverResponse = null, functions = {}, items = [] } = object;
    if (
      (this.accessKey && !eventObject.parameter.accessKey) ||
      (this.accessKey && eventObject.parameter.accessKey && eventObject.parameter.accessKey != this.accessKey)
    ) {
      this.values.push([this.date, null, null, "At server", "Invalid accessKey."]);
      const retObj = { "error": { "code": this.ErrorCode.InternalError, "message": "Invalid accessKey." }, "jsonrpc": this.jsonrpc };
      return ContentService.createTextOutput(JSON.stringify(retObj)).setMimeType(ContentService.MimeType.JSON);
    }

    if (items.length > 0 && !serverResponse && Object.keys(functions).length == 0) {
      const ki = ["initialize", "prompts/list", "prompts/get", "resources/list"];
      const { dupulicateChecked } = items.reduce((o, e) => {
        const t = e.type;
        const n = e.value.name;
        if (!ki.includes(t) && o.temp[n]) {
          console.warn(`"${n}" is duplicated. So, this is removed.`);
        } else {
          o.temp[n] = true;
          o.dupulicateChecked.push(e);
        }
        return o;
      }, { dupulicateChecked: [], temp: {} });

      const oo = dupulicateChecked.reduce((o, e) => {
        const type = e.type;
        const [k] = type.split("/");
        if (!ki.includes(type) && o.serverResponse[type]) {
          o.serverResponse[type].result[k].push(e.value);
        } else {
          let tempObj;
          if (type == "initialize") {
            if (o.serverResponse[type]) {
              let resultObj;
              if (JSON.stringify(o.serverResponse[type].result).length < JSON.stringify(e.value).length) {
                resultObj = e.value;
              } else {
                resultObj = o.serverResponse[type].result;
              }
              tempObj = { jsonrpc: this.jsonrpc, result: resultObj };
            } else {
              tempObj = { jsonrpc: this.jsonrpc, result: e.value };
            }
          } else if (type == "prompts/list") {
            if (o.serverResponse[type]) {
              let resultObj;
              if (o.serverResponse[type].result?.prompts && Array.isArray(o.serverResponse[type].result?.prompts)) {
                o.serverResponse[type].result.prompts.push(...e.value.prompts);
                o.serverResponse[type].result.prompts.sort((a, b) => a.name > b.name ? 1 : -1);
              }
              resultObj = o.serverResponse[type].result;
              tempObj = { jsonrpc: this.jsonrpc, result: resultObj };
            } else {
              tempObj = { jsonrpc: this.jsonrpc, result: e.value };
            }
          } else if (type == "prompts/get") {
            if (o.serverResponse[type]) {
              if (o.serverResponse[type].result) {
                let resultObj;
                if (JSON.stringify(o.serverResponse[type].result).length < JSON.stringify(e.value).length) {
                  resultObj = e.value;
                } else {
                  resultObj = o.serverResponse[type].result;
                }
                tempObj = { jsonrpc: this.jsonrpc, result: resultObj };
              } else {
                Object.entries(e.value).forEach(([k, v]) => {
                  o.serverResponse[type][k] = { jsonrpc: this.jsonrpc, result: v };
                });
                tempObj = o.serverResponse[type];
              }
            } else {
              if (e.value.messages) {
                tempObj = { jsonrpc: this.jsonrpc, result: e.value };
              } else {
                tempObj = {};
                Object.entries(e.value).forEach(([k, v]) => {
                  tempObj[k] = { jsonrpc: this.jsonrpc, result: v };
                });
              }
            }
          } else if (type == "resources/list") {
            if (o.serverResponse[type]) {
              let resultObj;
              if (JSON.stringify(o.serverResponse[type].result).length < JSON.stringify(e.value).length) {
                resultObj = e.value;
              } else {
                resultObj = o.serverResponse[type].result;
              }
              tempObj = { jsonrpc: this.jsonrpc, result: resultObj };
            } else {
              tempObj = { jsonrpc: this.jsonrpc, result: e.value };
            }
          } else {
            tempObj = { jsonrpc: this.jsonrpc, result: { [k]: [e.value] } };
          }
          o.serverResponse[type] = tempObj;
        }
        if (e.hasOwnProperty("function")) {
          const kk = `${k}/call`;
          if (o.functions[kk]) {
            o.functions[kk][e.function.name] = e.function;
          } else {
            o.functions[kk] = { [e["function"]["name"]]: e.function };
          }
        }
        return o;
      }, { serverResponse: {}, functions: {} });
      serverResponse = oo.serverResponse;
      functions = oo.functions;
    }

    const obj = this.parseObj_(eventObject);
    let retObj = null;
    if (Array.isArray(obj)) {
      retObj = obj.reduce((ar, o) => {
        const r = this.batchProcess_({ obj: o, serverResponse, functions });
        if (r) {
          ar.push(r);
        }
        return ar;
      }, []).filter(e => e);
      if (retObj.length == 0) {
        return null;
      }
    } else {
      retObj = this.batchProcess_({ obj, serverResponse, functions });
    }

    if (retObj) {
      const data = JSON.stringify(retObj);
      if (Array.isArray(retObj)) {
        this.values.push([this.date, "batch process", null, "server --> client", data]);
      }
      return ContentService.createTextOutput(data).setMimeType(ContentService.MimeType.JSON);
    }
    return null;
  }


  /*****************************************************************************************************
  * For client
  */

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
  * @param {Array} object.mcpServerObj MCP servers installed as the library.
  * @return {MCPApp}
  */
  client(object = {}) {
    this.errorProcessForClient_(object);
    if (!object.mcpServerUrls || !Array.isArray(object.mcpServerUrls) || object.mcpServerUrls.length == 0) {
      object.mcpServerUrls = [];
    }

    this.clientInfo = { name: "MCApp_client", version: "1.0.0" };

    /** @private */
    this.model = "models/gemini-2.0-flash"; // and "models/gemini-2.5-flash-preview-04-17"

    /** @private */
    this.id = 0;

    /** @private */
    this.headers = { authorization: "Bearer " + ScriptApp.getOAuthToken() };

    this.prepareClient_(object);
    return this;
  }

  /**
  * ### Description
  * Main method for the MCP client.
  *
  * @param {String} object.apiKey API key for using Gemini API.
  * @param {String} object.prompt Prompt
  * @param {Array} object.mcpServerUrls MCP server URLs.
  * @param {Object} object Object using this script.
  * @return {Object}
  */
  callMCPServers() {
    console.log(`--- start: Call MCP servers or functions (client --> server)`);

    if (!this.functions) {
      this.functions = { params_: {} };
    }

    let functionCallings = Object.entries(this.functions.params_).map(([k, v]) => (
      `- Name: "${k}", Details: ${JSON.stringify(v)}`
    ));
    if (functionCallings.length == 0) {
      functionCallings = ["No functions."];
    }

    const mcpServerInfAr = this.mcpServerObj.reduce((ar, o) => {
      if (o.initialize?.result?.serverInfo) {
        const v = o.initialize.result.serverInfo;
        ar.push(`Name: ${v.name}, Version: ${v.version}`);
      }
      return ar;
    }, []);
    const mcpServerInf = [
      `The name and version of the available MCP server are as follows.`,
      ...mcpServerInfAr,
    ];

    const systemInstructionText = [
      "You are an expert delegator capable of assigning user requests to appropriate Model Context Protocol (MCP) servers. You create the suitable order for processing functions.",
      "<Functions>",
      "The following functions are the available functions list. The JSON schema of the value of 'Details' is the same as the schema for the function calling. From 'Details', understand the functions.",
      ...functionCallings,
      "</Functions>",
      "<Mission>",
      "- Understand the functions and the tasks that the functions can do.",
      "- Understand requests of the user's prompt.",
      "- For actionable tasks that the functions can do, select a suitable one of the given functions for accurately resolving requests of the user's prompt in the suitable order. Always include the function name when responding to the user.",
      "If multiple processes can be run with a single function, create a suitable prompt including those processes in it.",
      "- If the suitable functions cannot be found, directly answer without using them.",
      `- Use "without_function", if all other functions except for "without_function" can not resolve the tasks.`,
      `- In the case that you are required to confirm whether the process is required to be stopped or continued between each process, use the function "check_process" just after each process.`,
      "</Mission>",
      "<Important>",
      "- Do not fabricate responses.",
      "- If you are unsure, ask the user for more details.",
      "- Suggest the suitable order of the functions to resolve the user's prompt.",
      "- When the requests include both the function that can be resolved and the function that cannot be resolved, suggest the order by including the functions.",
      `- Don't include some code in the response value like "tool_code".`,
      `- Don't suggest some code in the response value like "tool_code".`,
      `- If you are required to know the current date time, it's "${Utilities.formatDate(this.date, this.timezone, "yyyy-MM-dd HH:mm:ss")}". And, timezone is ${this.timezone}.`,
      "</Important>",
    ].join("\n");

    const responseSchema = {
      title: "Order of functions and functions for resolving the user's prompt.",
      description: "Suggest the suitable order of the functions and the functions to resolve the user's prompt.",
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { description: "Function name.", type: "string" },
          task: { description: "For actionable tasks that the functions can do, select a suitable one of the given functions to accurately resolve requests of the user's prompt in the suitable order.", type: "string" },
        },
      },
    };
    const obj = {
      apiKey: this.clientObject.apiKey,
      systemInstruction: { parts: [{ text: systemInstructionText }], role: "model" },
      model: this.model,
      responseMimeType: "application/json",
      responseSchema,
    };
    const g = new GeminiWithFiles(obj);
    const textPrompt = [
      "User's prompt is as follows.",
      `<UserPrompt>${this.clientObject.prompt}</UserPrompt>`,
    ].join("\n");
    const orderAr = g.generateContent({ q: textPrompt });

    const orders = orderAr.map((e, i) => `${i + 1}: ${e.name}`).join("\n");
    console.log(`Task will be processed in the following order.\n${orders}`);

    if (!Array.isArray(orderAr) || orderAr.length == 0) {
      const err = "Internal server error";
      const errObj = { "error": { "code": this.ErrorCode[err], "message": `${err}. Try again.` }, "jsonrpc": "2.0", id };
      this.values.push([this.date, null, null, "Client side", JSON.stringify(errObj)]);
      return errObj;
    }

    console.log("--- start: Process result.");
    let tempHistory = this.clientObject.history || [];
    const systemInstructionText2 = [
      "You are an expert delegator capable of assigning user requests to appropriate functions with function calling.",
      "<Mission>",
      "- Understand the functions and the tasks that the functions can do.",
      "- Understand requests of the user's prompt.",
      `- If the function is required to provide the arguments, create the suitable arguments using the prompt and the history, and provide them to the function.`,
      `- Use "without_function", if all other functions except for "without_function" can not resolve the tasks.`,
      `- When you use the function "check_process", check carefully the previous history and decide whether the process is required to be stopped or continued.`,
      "</Mission>",
      "<Important>",
      "- Do not fabricate responses.",
      `- If you are required to know the current date time, it's "${Utilities.formatDate(this.date, this.timezone, "yyyy-MM-dd HH:mm:ss")}". And, timezone is ${this.timezone}.`,
      "- Available MCP servers are as follows. If the information of the MCP servers is required, use this.",
      "<MCPServers>",
      ...mcpServerInf,
      "</MCPServers>",
      "</Important>",
    ].join("\n");

    const ar = [];
    for (let i in orderAr) {
      const { name, task } = orderAr[i];
      console.log(`--- Running the function "${name}" by task "${task}".`);
      const funcCall = {
        params_: { [name]: this.functions.params_[name] },
        [name]: this.functions[name]
      };
      const obj = {
        apiKey: this.clientObject.apiKey,
        model: this.model,
        functions: funcCall,
        systemInstruction: { parts: [{ text: systemInstructionText2 }], role: "model" },
        history: tempHistory,
        toolConfig: {
          functionCallingConfig: {
            mode: "any",
            allowedFunctionNames: [name]
          }
        },
      };
      const gg = new GeminiWithFiles(obj);

      // console.log(gg.history[gg.history.length - 1]?.parts[0]?.functionResponse.response.content || ""); // For debug.

      const q = [
        `Your task is as follows.`,
        `<Task>${task}</Task>`,
      ];
      const res = gg.generateContent({ q: q.join("\n") });

      if (res.functionResponse) {
        try {
          if (typeof res.functionResponse == "string") {
            const funcResObj = JSON.parse(res.functionResponse);
            if (funcResObj?.result?.content) {
              ar.push(...funcResObj.result.content);
              gg.history[gg.history.length - 1].parts[0].functionResponse.response.content = funcResObj.result.content.filter(({ type }) => type == "text").map(({ text }) => text).join("\n");
            }
          } else {
            let msg = "";
            if (res.functionResponse.task && res.functionResponse.result) {
              if (name == "check_process") {
                if (res.functionResponse.result.stopProcess) {
                  msg = `Task: ${res.functionResponse.task}. The process was stopped. The reason for this is as follows. ${res.functionResponse.result.reason}`;
                  ar.push(msg);
                  break;
                } else {
                  msg = `Task: ${res.functionResponse.task}. Continue the process without errors.`;
                }
              } else {
                msg = `Task: ${res.functionResponse.task}, Result: ${res.functionResponse.result}`;
              }
            } else if (!res.functionResponse.task && res.functionResponse.result) {
              msg = `Task: ${task}, Result: ${res.functionResponse.result}`;
            } else {
              msg = "No response was returned.";
            }
            ar.push(msg);
            gg.history[gg.history.length - 1].parts[0].functionResponse.response.content = msg;
          }
        } catch ({ stack }) {
          console.warn(stack);
          ar.push(res.functionResponse);
          gg.history[gg.history.length - 1].parts[0].functionResponse.response.content = res.functionResponse;
        }
      }
      tempHistory = gg.history;
    }

    let finalResults = ar.flatMap(o => {
      const type = o.type;
      if (type == "text") {
        return o[type];
      } else if (typeof o == "string") {
        return o;
      }
      if (o.data) {
        const fileBlob = Utilities.newBlob(Utilities.base64Decode(o.data), o.mimeType, "sampleName");
        return [fileBlob, `The data of mimeType "${o.mimeType}" could be downloaded.`];
      }
      return [`The type of file was returned. But, the file content was not included in the response.`];
    });

    const strResults = finalResults.filter(e => typeof e == "string");
    if (strResults.length > 0) {
      const gg = new GeminiWithFiles({ apiKey: this.clientObject.apiKey, model: this.model, history: tempHistory });
      const res3 = gg.generateContent({
        parts: [
          { text: `Summarize answers by considering the question.` },
          { text: `<Question>${this.clientObject.prompt}</Question>` },
          { text: `<Answers>${strResults.join("\n")}</Answers>` }
        ]
      });
      g.history = gg.history;
      finalResults = [res3, ...finalResults.filter(e => typeof e != "string")];
    }

    this.values.push([this.date, null, null, "Client side", JSON.stringify(finalResults)]);

    console.log("--- end: Process result.");
    return { result: finalResults, history: g.history };
  }

  /**
  * ### Description
  * Check parameters for client.
  *
  * @param {Object} object Object using this script.
  * @return {void}
  * @private
  */
  errorProcessForClient_(object) {
    if (!object.apiKey) {
      throw new Error("Please set your API key for using Gemini API.");
    }
    if (!object.prompt) {
      throw new Error("Please set your prompt.");
    }
  }

  /**
  * ### Description
  * Merge functions.
  *
  * @param {Object} func1
  * @param {Object} func2
  * @return {Object} Merged functions.
  */
  mergeFunctions_(func1, func2) {
    func1.params_ = { ...func1.params_, ...func2.params_ };
    const keys = Object.keys(func2.params_);
    return { ...func1, ...Object.fromEntries(keys.map(k => [k, func2[k]])) };
  }

  /**
   * ### Description
   * This is an object including the tools of MCP servers and the user's custom functions.
   * You can see the specification of this object as follows.
   * Ref: https://github.com/tanaikech/GeminiWithFiles?tab=readme-ov-file#use-function-calling
   * 
   * @return {Object}
   * @private
   */
  getClientFunctions_(functionsofMCPServers, addedFunctions) {
    let funcs = {
      params_: {
        without_function: {
          description: `Use this if all other functions except for "without_function" can not resolve the tasks. At that time, think of a solution to the task using the knowledge you have.`,
          parameters: {
            type: "object",
            properties: {
              task: { type: "string", description: "Details of task." },
              response: { type: "string", description: "Response to the task." },
            },
            required: ["task", "response"]
          }
        },

        check_process: {
          description: `When you use the function "check_process", check carefully the previous history and decide whether the process is required to be stopped or continued. Confirm the previous history. Use this to determine whether it is necessary to stop or continue the process.`,
          parameters: {
            type: "object",
            properties: {
              stopProcess: { type: "boolean", description: `When you use the function "check_process", check carefully the previous history and decide whether the process is required to be stopped or continued. Confirm the previous history. When it is required to stop the process, set this to true. When it is not required to stop the process, set this to false. It is required to return true or false.` },
              task: { type: "string", description: "Details of task." },
              reason: { type: "string", description: "Reason for stopping the process." },
            },
            required: ["stopProcess", "task", "reason"]
          }
        }
      },

      without_function: ({ task, response }) => {
        console.log("--- without_function");
        console.log(`--- Prompt: ${task}`);
        return { task, result: response };
      },

      check_process: ({ stopProcess, task, reason }) => {
        console.log("--- check_process");
        console.log(`--- Prompt: ${task}`);
        console.log(`--- stopProcess: ${stopProcess}`);
        console.log(`--- reason: ${reason}`);
        return { task, result: { stopProcess, reason } };
      }
    };

    // Add functions from MCP server.
    if (functionsofMCPServers && functionsofMCPServers.params_ && Object.keys(functionsofMCPServers).length > 1) {
      funcs = this.mergeFunctions_(funcs, functionsofMCPServers);
    }

    // Add user's custom functions.
    if (addedFunctions && addedFunctions.params_ && Object.keys(addedFunctions).length > 1) {
      funcs = this.mergeFunctions_(funcs, addedFunctions);
    }
    return funcs;
  }

  /**
  * ### Description
  * Create a request.
  *
  * @return {Object}
  */
  createRequest_(object) {
    const { u, obj } = object;
    const { url, queryParameters } = this.parseQueryParameters_(u.trim());
    const path = url.split("/").pop();
    if (["exec", "dev"].includes(path)) { // <--- For Web Apps created by Google Apps Script
      return { url: this.addQueryParameters_(url.trim(), queryParameters || {}), headers: this.headers, payload: obj, muteHttpExceptions: true };
    }
    return { url: this.addQueryParameters_(url.trim(), queryParameters || {}), payload: obj, muteHttpExceptions: true };
  }

  /**
  * ### Description
  * Create requests for gettting lists from MCP servers.
  *
  * @param {String} method
  * @return {void}
  */
  getRequest_(method) {
    this.id++;
    const obj = { method, params: {}, jsonrpc: this.jsonrpc, id: this.id };
    return this.mcpServerObj.map(({ serverUrl }) =>
      this.createRequest_({ u: serverUrl, obj: JSON.stringify(obj) })
    );
  }

  /**
  * ### Description
  * Get lists from MCP servers.
  *
  * @param {Object} object
  * @return {void}
  */
  getLists_(object) {
    const { method, requests } = object;
    this.fetch_(requests).forEach((r, i) => {
      const u = requests[i].url;
      const idx = this.mcpServerObj.findIndex(e => e.serverUrl == u);
      if (r.getResponseCode() == 200 && idx > -1) {
        const text = r.getContentText();
        let resObj = null;
        try {
          resObj = JSON.parse(text);
          resObj = resObj.result ? resObj : null;
        } catch ({ stack }) {
          // console.warn(stack); // If you want to check the error message, please use this.
        }
        if (resObj) this.mcpServerObj[idx][method] = resObj;
      }
    });
  }

  /**
  * ### Description
  * Parse response from MCP servers with the batch process.
  *
  * @param {Object} object
  * @return {void}
  */
  parseBatchProcess_(object) {
    const { mcpServerUrls, reqs } = object;
    const rr = mcpServerUrls.reduce((o, e) => {
      o[e] = { url: e, payload: [] };
      reqs.forEach(({ requests }) => {
        requests.forEach(({ url, payload }) => {
          if (url == e) {
            o[e].payload.push(JSON.parse(payload));
          }
        });
      });
      return o;
    }, {});
    const v = Object.values(rr);
    const methodObj = v.map(({ payload }) => payload.reduce((o, { method, id }) => (o[id] = method, o), {}));
    const requests = v.reduce((ar, { url, payload }) => {
      if (payload.length > 0) {
        ar.push(this.createRequest_({ u: url, obj: JSON.stringify(payload) }));
      }
      return ar;
    }, []);
    if (requests.length > 0) {
      this.fetch_(requests).forEach((r, i) => {
        const u = requests[i].url;
        const idx = this.mcpServerObj.findIndex(e => e.serverUrl == u);
        if (r.getResponseCode() == 200 && idx > -1) {
          const text = r.getContentText();
          try {
            const resAr = JSON.parse(text);
            resAr.forEach(resObj => {
              if (resObj.result) {
                this.mcpServerObj[idx][methodObj[i][resObj.id]] = resObj;
              }
            });

          } catch ({ stack }) {
            // console.warn(stack); // If you want to check the error message, please use this.
          }
        }
      });
    }
  }

  /**
  * ### Description
  * Create functions for GeminiWithFiles.
  *
  * @return {void}
  */
  createFunctions_() {
    const methodConvObj = { "resources/list": "resources/read", "prompts/list": "prompts/get", "tools/list": "tools/call" };
    // const methodConvObj = { "tools/list": "tools/call" }; // Use this, if you want to use only "tools/call".
    const methodConvKeys = Object.keys(methodConvObj);
    const getFunc_ = ({ payload, serverUrl }) => this.fetch_([this.createRequest_({ u: serverUrl, obj: JSON.stringify(payload) })])[0].getContentText();
    const functionsofMCPServers = this.mcpServerObj.reduce((o, e) => {
      const { serverUrl } = e;
      methodConvKeys.forEach(k => {
        const kk = k.split("/")[0];
        const { result, id } = e[k] || {};
        const oo = (result && result[kk]) ? result[kk] : [];
        if (oo.length > 0) {
          oo.forEach(fObj => {
            const { name, description, uri, inputSchema } = fObj;
            const fn = name.replace(/ /g, "_").trim();
            let parameters = null;
            let func = null;
            if (kk == "resources") {
              parameters = { title: name, description };
              func = function () {
                console.log(`--- function ${fn}`);
                const payload = { method: methodConvObj[k], params: { uri }, jsonrpc: this.jsonrpc, id: id + 1 };
                return getFunc_({ payload, serverUrl });
              }
            } else if (kk == "prompts") {
              const argumentNames = fObj.arguments.map(p => p.name.replace(/ /g, "_").trim());
              const properties = fObj.arguments.reduce((oa, p, i) => (oa[argumentNames[i]] = { type: "string", description: p.description }, oa), {});
              parameters = { title: name, description, parameters: { type: "object", properties, required: Object.keys(properties) } };
              func = function (obj) {
                console.log(`--- function ${fn}`);
                console.log(JSON.stringify(obj));
                const payload = { method: methodConvObj[k], params: { name: fn, arguments: obj }, jsonrpc: this.jsonrpc, id: id + 1 };
                return getFunc_({ payload, serverUrl });
              }
            } else if (kk == "tools") {
              parameters = { title: name, description, parameters: inputSchema };
              func = function (obj) {
                console.log(`--- function ${fn}`);
                console.log(JSON.stringify(obj));
                const payload = { method: methodConvObj[k], params: { name: fn, arguments: obj }, jsonrpc: this.jsonrpc, id: id + 1 };
                return getFunc_({ payload, serverUrl });
              }
            }
            if (parameters && func) {
              o.params_[fn] = { title: name, description, ...parameters };
              o[fn] = func;
            }
          });
        }
      });
      return o;
    }, { params_: {} });


    let addedFunctions = null;
    if (this.clientObject.functions && this.clientObject.functions.params_ && Object.keys(this.clientObject.functions).length > 1) {
      addedFunctions = { ...this.clientObject.functions };
    }
    const createdFunctions = this.getClientFunctions_(functionsofMCPServers, addedFunctions);

    if (createdFunctions.params_) {
      console.log(`In this run, ${Object.keys(createdFunctions.params_).length} functions are used.`);
    }

    /** @private */
    this.functions = createdFunctions;
  }

  /**
  * ### Description
  * Method for preparing the MCP client.
  *
  * @param {Object} object Object using this script.
  * @return {MCPApp}
  */
  prepareClient_(object) {
    this.clientObject = object;
    const { mcpServerUrls, batchProcess = false, mcpServerObj } = this.clientObject;

    if (mcpServerObj && Array.isArray(mcpServerObj) && mcpServerObj.length > 0) {
      const mcpServerFunctions = mcpServerObj.flat().reduce((o, e) => {
        if (e.type == "tools/list") {
          const k = e.value.name;
          o[k] = e["function"];
          o.params_[k] = {
            name: k,
            description: e.value.description,
            parameters: e.value.inputSchema,
          }
        }
        return o;
      }, { params_: {} });
      if (this.clientObject.functions && this.clientObject.functions.params_ && Object.keys(this.clientObject.functions) > 1) {
        this.clientObject.functions = this.mergeFunctions_(this.clientObject.functions, mcpServerFunctions);
      } else {
        this.clientObject.functions = mcpServerFunctions;
      }
    }

    if (mcpServerUrls && Array.isArray(mcpServerUrls) && mcpServerUrls.length > 0) {
      // initialize
      const method1 = "initialize";
      console.log(`--- start: ${method1} (client --> server)`);
      const initializeObj = {
        method: method1,
        params: {
          protocolVersion: this.protocolVersion,
          capabilities: {},
          clientInfo: this.clientInfo
        },
        jsonrpc: this.jsonrpc,
        id: this.id
      };
      const initializeRequests = mcpServerUrls.map(u => this.createRequest_({ u, obj: JSON.stringify(initializeObj) }));
      this.mcpServerObj = this.fetch_(initializeRequests).reduce((ar, r, i) => {
        if (r.getResponseCode() == 200) {
          const text = r.getContentText();
          this.values.push([this.date, method1, this.id, "server --> client", text]);
          try {
            const obj = JSON.parse(text);
            ar.push({ serverUrl: mcpServerUrls[i].trim(), [method1]: obj });
          } catch ({ stack }) {
            console.warn(stack);
            ar.push({ serverUrl: mcpServerUrls[i].trim(), [method1]: null });
          }
        }
        return ar;
      }, []);

      // notifications/initialized, notifications/cancelled
      const method2 = "notifications/initialized";
      const method3 = "notifications/cancelled";
      console.log(`--- start: ${method2}, ${method3} (client --> server)`);
      const notificationsInitializedObj = { method: method2, jsonrpc: this.jsonrpc };
      const notificationsCancelledObj = { method: method3, params: { requestId: this.id, reason: `Error: MCP error. InternalError: ${this.ErrorCode.InternalError}`, jsonrpc: this.jsonrpc } };
      const { notificationsInitializedRequests, notificationsCancelledRequests } = this.mcpServerObj.reduce((o, e) => {
        const { serverUrl } = e;
        if (e[method1]) {
          o.notificationsInitializedRequests.push(this.createRequest_({ u: serverUrl, obj: JSON.stringify(notificationsInitializedObj) }));
        } else {
          o.notificationsCancelledRequests.push(this.createRequest_({ u: serverUrl, obj: JSON.stringify(notificationsCancelledObj) }));
        }
        return o;
      }, { notificationsInitializedRequests: [], notificationsCancelledRequests: [] });
      if (notificationsInitializedRequests.length == 0) {
        this.values.push([this.date, method2, this.id, "At client", "Couldn't initialize MCPs."]);
        return this;
      }
      if (notificationsCancelledRequests.length > 0) {
        const res = this.fetch_(notificationsCancelledRequests).map(r => r.getContentText());
        console.log(res);
      }
      this.fetch_(notificationsInitializedRequests);
      // If you want to confirm the response from MCP server for "notifications/initialized", please use the following script.
      // const resForNotificationsInitialized = this.fetch_(notificationsInitializedRequests);
      // resForNotificationsInitialized.forEach((r, i) => {
      //   const u = notificationsInitializedRequests[i].url;
      //   const idx = this.mcpServerObj.findIndex(e => e.serverUrl == u);
      //   if (r.getResponseCode() == 200 && idx > -1) {
      //     console.log(r.getContentText()); // or this.mcpServerObj[idx][method2] = r.getContentText();
      //   }
      // });

      const methodsForListing = ["resources/list", "prompts/list", "tools/list"];
      const reqs = methodsForListing.map(m => ({ method: m, requests: this.getRequest_(m) }));
      if (batchProcess) {
        console.log(`--- start: Get lists from servers with a batch process. (client --> server)`);
        this.parseBatchProcess_({ mcpServerUrls, reqs });
      } else {
        console.log(`--- start: Get lists from servers without a batch process. (client --> server)`);
        reqs.forEach(rq => this.getLists_(rq));
      }
      this.createFunctions_();

    } else {
      console.log(`--- No MCP URLs.`);
      this.values.push([this.date, null, null, "At client", "No MCP URLs."]);
      let addedFunctions = null;
      if (this.clientObject.functions && this.clientObject.functions.params_ && Object.keys(this.clientObject.functions).length > 1) {
        addedFunctions = { ...this.clientObject.functions };
      }
      const createdFunctions = this.getClientFunctions_(null, addedFunctions);
      if (createdFunctions.params_) {
        console.log(`In this run, ${Object.keys(createdFunctions.params_).length} functions are used.`);
      }

      /** @private */
      this.functions = createdFunctions;

    }

    return this;
  }



  /*****************************************************************************************************
  * Tools
  */

  /**
  * ### Description
  * Return the created functions.
  *
  * @return {Object}
  */
  get getFunctions() {
    return this.functions;
  }

  /**
  * ### Description
  * Fetch
  *
  * @param {Array} requests
  * @return {UrlFetchApp.HTTPResponse[]}
  * @private
  */
  fetch_(requests) {
    const res = UrlFetchApp.fetchAll(requests);
    return res;
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
   * Ref: https://github.com/tanaikech/UtlApp?tab=readme-ov-file#parsequeryparameters
   * 
   * ### Description
   * This method is used for parsing the URL including the query parameters.
   * Ref: https://tanaikech.github.io/2018/07/12/adding-query-parameters-to-url-using-google-apps-script/
   *
   * @param {String} url The URL including the query parameters.
   * @return {Object} JSON object including the base url and the query parameters.
   * @private
   */
  parseQueryParameters_(url) {
    if (url === null || typeof url != "string") {
      throw new Error("Please give URL (String) including the query parameters.");
    }
    const s = url.split("?");
    if (s.length == 1) {
      return { url: s[0], queryParameters: null };
    }
    const [baseUrl, query] = s;
    if (query) {
      const queryParameters = query.split("&").reduce(function (o, e) {
        const temp = e.split("=");
        const key = temp[0].trim();
        let value = temp[1].trim();
        value = isNaN(value) ? value : Number(value);
        if (o[key]) {
          o[key].push(value);
        } else {
          o[key] = [value];
        }
        return o;
      }, {});
      return { url: baseUrl, queryParameters };
    }
    return null;
  }

  /**
   * Ref: https://github.com/tanaikech/UtlApp?tab=readme-ov-file#addqueryparameters
   * 
   * ### Description
   * This method is used for adding the query parameters to the URL.
   * Ref: https://tanaikech.github.io/2018/07/12/adding-query-parameters-to-url-using-google-apps-script/
   *
   * @param {String} url The base URL for adding the query parameters.
   * @param {Object} obj JSON object including query parameters.
   * @return {String} URL including the query parameters.
   * @private
   */
  addQueryParameters_(url, obj) {
    if (url === null || obj === null || typeof url != "string") {
      throw new Error(
        "Please give URL (String) and query parameter (JSON object)."
      );
    }
    const o = Object.entries(obj);
    return (
      (url == "" ? "" : `${url}${o.length > 0 ? "?" : ""}`) +
      o.flatMap(([k, v]) =>
        Array.isArray(v)
          ? v.map((e) => `${k}=${encodeURIComponent(e)}`)
          : `${k}=${encodeURIComponent(v)}`
      )
        .join("&")
    );
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