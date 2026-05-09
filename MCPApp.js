/**
 * Class object for MCP (Model Context Protocol).
 * Author: Kanshi Tanaike
 * Refactored by: Senior Generative AI & MCP Expert
 * Version: 2.0.11
 * Date: 2026-05-09 15:48
 * @class
 */
class MCPApp {
  /**
   * @param {Object} object - Object used to initialize this script.
   * @param {string} [object.accessKey=null] - Default is null. Used for accessing the Web Apps.
   * @param {boolean} [object.log=false] - Default is false. When true, the log between the MCP client and server is stored in Google Sheets.
   * @param {string}[object.spreadsheetId] - Spreadsheet ID. Logs are stored in the "log" sheet of this spreadsheet.
   * @param {boolean} [object.lock=true] - Default is true. By default, the script runs with LockService to prevent concurrency issues.
   * @return {MCPApp}
   */
  constructor(object = {}) {
    const {
      accessKey = null,
      log = false,
      spreadsheetId = null,
      lock = true,
    } = object;

    /** @private */
    this.accessKey = accessKey;

    /**
     * Standard JSON-RPC error codes.
     * @see https://modelcontextprotocol.io/docs/concepts/architecture#error-handling
     * @private
     */
    this.ErrorCode = {
      ParseError: -32700,
      InvalidRequest: -32600,
      MethodNotFound: -32601,
      InvalidParams: -32602,
      InternalError: -32603,
    };

    /** @private */
    this.protocolVersion = "2024-11-05"; // Alternatively "2025-03-26"

    /** @private */
    this.jsonrpc = "2.0";

    /** @private */
    this.date = new Date();

    /** @private */
    this.timezone = Session.getScriptTimeZone();

    /** @private */
    this.log = log;

    if (this.log) {
      const ss = spreadsheetId
        ? SpreadsheetApp.openById(spreadsheetId)
        : SpreadsheetApp.create("Log_MCPApp");

      /** @private */
      this.sheet = ss.getSheetByName("log") || ss.insertSheet("log");
    }

    /** @private */
    this.values = [];

    /** @private */
    this.useLock = lock;

    this.lock = LockService.getScriptLock();

    /** @private */
    this.clientObject = {};
  }

  /**
   * ### Description
   * Sets services dependent on each script environment, such as LockService and PropertiesService.
   * Set these services if utilizing MCPApp as a library.
   *
   * @param {Object} services - Object containing the services you want to use.
   * @param {GoogleAppsScript.Lock.Lock} [services.lock] - Instance of LockService (e.g., getScriptLock()).
   * @param {GoogleAppsScript.Properties.Properties} [services.properties] - Instance of PropertiesService.
   * @return {MCPApp}
   */
  setServices(services = {}) {
    const { lock, properties } = services;
    if (lock && lock.toString() === "Lock") {
      this.lock = lock;
    }
    if (properties && properties.toString() === "Properties") {
      this.properties = properties;
    }
    return this;
  }

  /*****************************************************************************************************
   * SERVER METHODS
   *****************************************************************************************************/

  /**
   * ### Description
   * Main entry method for the MCP server.
   *
   * @param {Object} object - Execution object.
   * @param {Object} object.eventObject - Event object from the doPost function.
   * @param {Object} object.serverResponse - Object structured for the server response.
   * @param {Object} object.functions - Functions mapped for usage via tools/call.
   * @param {Array}  object.items - Items including server responses and functions.
   * @return {GoogleAppsScript.Content.TextOutput}
   */
  server(object = {}) {
    this.errorProcessForServer_(object);

    const obj = this.parseObj_(object.eventObject);
    const lockedMethods = [
      "initialize",
      "notifications/initialized",
      "tools/list",
      "prompts/list",
      "resources/list",
    ];

    if (
      (obj?.method && lockedMethods.includes(obj.method)) ||
      this.useLock === true
    ) {
      return this.lockedMethod_(object);
    }

    try {
      return this.serverMain_(object);
    } catch ({ stack }) {
      throw new Error(`Server Execution Error: ${stack}`);
    }
  }

  /**
   * ### Description
   * Core server logic execution.
   *
   * @param {Object} object
   * @return {GoogleAppsScript.Content.TextOutput}
   * @private
   */
  serverMain_(object) {
    const res = this.createResponse_(object);
    if (this.log) {
      this.log_();
    }
    return res;
  }

  /**
   * ### Description
   * Executes the server logic under a lock state to prevent concurrency overlaps.
   *
   * @param {Object} object
   * @return {GoogleAppsScript.Content.TextOutput}
   * @private
   */
  lockedMethod_(object) {
    const lock = this.lock;
    if (!lock.tryLock(350000)) {
      throw new Error("Timeout: Could not acquire lock.");
    }
    try {
      return this.serverMain_(object);
    } catch ({ stack }) {
      throw new Error(`Locked Execution Error: ${stack}`);
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * ### Description
   * Validates the initialization parameters for the server.
   *
   * @param {Object} object
   * @return {void}
   * @private
   */
  errorProcessForServer_(object) {
    if (!object.eventObject) {
      throw new Error(
        "Missing 'eventObject'. Please pass the event object from doPost().",
      );
    }
    if (!object.serverResponse && !object.items) {
      throw new Error(
        "Missing 'serverResponse' or 'items'. Please set your server object configurations.",
      );
    }
  }

  /**
   * ### Description
   * Replaces variables mapped in arguments into the target message content.
   *
   * @param {Array} messages - Message array to modify.
   * @param {Object} args - Arguments dictionary containing keys and replacement values.
   * @private
   */
  replaceTemplateVariables_(messages, args) {
    if (!messages || !args) return;
    Object.entries(args).forEach(([key, value]) => {
      messages.forEach((msg) => {
        if (msg.content?.text) {
          msg.content.text = msg.content.text.replaceAll(
            `{{${key}}}`,
            String(value),
          );
        }
      });
    });
  }

  /**
   * ### Description
   * Handles batch processing of individual JSON-RPC calls.
   *
   * @param {Object} object
   * @return {Object|null}
   * @private
   */
  batchProcess_(object) {
    const { obj, serverResponse, functions } = object;
    if (!obj || !("method" in obj)) return null;

    const method = obj.method.toLowerCase();
    const id = obj.id ?? "No ID";
    this.values.push([
      this.date,
      method,
      id,
      "client --> server",
      JSON.stringify(obj),
    ]);

    let retObj;

    // Handle standard server responses
    if (serverResponse && method in serverResponse) {
      if (serverResponse[method].result) {
        try {
          retObj = serverResponse[method];
          this.replaceTemplateVariables_(
            retObj.result?.messages,
            obj.params?.arguments,
          );
        } catch ({ stack }) {
          retObj = {
            error: { code: this.ErrorCode.InternalError, message: stack },
            jsonrpc: this.jsonrpc,
          };
        }
        retObj.id = id;
        this.values.push([
          this.date,
          method,
          id,
          "server --> client",
          JSON.stringify(retObj),
        ]);
        return retObj;
      }

      // Handle named prompt execution
      const resName = obj.params?.name;
      if (resName && serverResponse[method][resName]) {
        retObj = serverResponse[method][resName];
        retObj.id = id;
        this.replaceTemplateVariables_(
          retObj.result?.messages,
          obj.params?.arguments,
        );
      } else {
        retObj = {
          error: {
            code: this.ErrorCode.InvalidParams,
            message: `No prompt found with name "${resName}".`,
          },
          jsonrpc: this.jsonrpc,
          id,
        };
      }

      this.values.push([
        this.date,
        method,
        id,
        "server --> client",
        JSON.stringify(retObj),
      ]);
      return retObj;
    }

    // Handle function executions via Tools
    if (functions && method in functions) {
      const funcGroup = functions[method];
      try {
        const paramName = obj.params?.name;
        const paramUri = obj.params?.uri;

        if (paramName && funcGroup[paramName]) {
          retObj = funcGroup[paramName](obj.params?.arguments || null);
          if (
            retObj?.result &&
            typeof retObj.result === "string" &&
            Object.keys(retObj).length === 1
          ) {
            retObj = {
              jsonrpc: this.jsonrpc,
              result: {
                content: [{ type: "text", text: retObj.result }],
                isError: false,
              },
            };
          } else if (retObj?.mcp) {
            retObj = retObj.mcp;
          }
        } else if (paramUri && funcGroup[paramUri]) {
          retObj = funcGroup[paramUri]();
        } else {
          retObj = {
            error: {
              code: this.ErrorCode.MethodNotFound,
              message: `Method or Function "${method}" could not be executed.`,
            },
            jsonrpc: this.jsonrpc,
          };
        }
      } catch ({ stack }) {
        retObj = {
          error: { code: this.ErrorCode.InternalError, message: stack },
          jsonrpc: this.jsonrpc,
        };
      }
      retObj.id = id;
      this.values.push([
        this.date,
        method,
        id,
        "server --> client",
        JSON.stringify(retObj),
      ]);
      return retObj;
    }

    // Fallback if no processor found
    this.values.push([
      this.date,
      method,
      id,
      "server --> client",
      `No return value mapped for ID ${id}.`,
    ]);
    return null;
  }

  /**
   * ### Description
   * Helper to evaluate and return the larger JSON object string, preventing overwrites of expanded data.
   *
   * @param {Object} currentObj
   * @param {Object} newObj
   * @return {Object}
   * @private
   */
  updateResultIfLarger_(currentObj, newObj) {
    if (!currentObj) return newObj;
    return JSON.stringify(currentObj).length < JSON.stringify(newObj).length
      ? newObj
      : currentObj;
  }

  /**
   * ### Description
   * Constructs the text output response for the MCP client.
   *
   * @param {Object} object
   * @return {GoogleAppsScript.Content.TextOutput|null}
   * @private
   */
  createResponse_(object) {
    let {
      eventObject,
      serverResponse = null,
      functions = {},
      items = [],
    } = object;

    // Access Key Validation
    const reqAccessKey = eventObject.parameter?.accessKey;
    if (this.accessKey && reqAccessKey !== this.accessKey) {
      const errMsg = "Invalid accessKey provided.";
      this.values.push([this.date, null, null, "At server", errMsg]);
      const retObj = {
        error: { code: this.ErrorCode.InvalidRequest, message: errMsg },
        jsonrpc: this.jsonrpc,
      };
      return ContentService.createTextOutput(
        JSON.stringify(retObj),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Dynamic Items Construction
    if (
      items.length > 0 &&
      !serverResponse &&
      Object.keys(functions).length === 0
    ) {
      const lockedTypes = [
        "initialize",
        "prompts/list",
        "prompts/get",
        "resources/list",
      ];
      const duplicateChecked = [];
      const itemSet = new Set();

      // Deduplicate items
      items.forEach((e) => {
        const type = e.type;
        const name = e.value?.name;
        if (!lockedTypes.includes(type) && name && itemSet.has(name)) {
          console.warn(`Item "${name}" is duplicated and will be ignored.`);
        } else {
          if (name) itemSet.add(name);
          duplicateChecked.push(e);
        }
      });

      // Construct maps
      const generated = duplicateChecked.reduce(
        (acc, e) => {
          const type = e.type;
          const rootKey = type.split("/")[0];

          if (!lockedTypes.includes(type) && acc.serverResponse[type]) {
            acc.serverResponse[type].result[rootKey].push(e.value);
          } else {
            let tempObj = {};
            if (type === "initialize" || type === "resources/list") {
              const existingRes = acc.serverResponse[type]?.result;
              tempObj = {
                jsonrpc: this.jsonrpc,
                result: this.updateResultIfLarger_(existingRes, e.value),
              };
            } else if (type === "prompts/list") {
              let resultObj = acc.serverResponse[type]?.result || {
                prompts: [],
              };
              if (e.value.prompts && Array.isArray(e.value.prompts)) {
                resultObj.prompts.push(...e.value.prompts);
                resultObj.prompts.sort((a, b) => (a.name > b.name ? 1 : -1));
              }
              tempObj = { jsonrpc: this.jsonrpc, result: resultObj };
            } else if (type === "prompts/get") {
              if (acc.serverResponse[type]) {
                if (acc.serverResponse[type].result) {
                  const existingRes = acc.serverResponse[type].result;
                  tempObj = {
                    jsonrpc: this.jsonrpc,
                    result: this.updateResultIfLarger_(existingRes, e.value),
                  };
                } else {
                  Object.entries(e.value).forEach(([k, v]) => {
                    acc.serverResponse[type][k] = {
                      jsonrpc: this.jsonrpc,
                      result: v,
                    };
                  });
                  tempObj = acc.serverResponse[type];
                }
              } else {
                if (e.value.messages) {
                  tempObj = { jsonrpc: this.jsonrpc, result: e.value };
                } else {
                  Object.entries(e.value).forEach(([k, v]) => {
                    tempObj[k] = { jsonrpc: this.jsonrpc, result: v };
                  });
                }
              }
            } else {
              tempObj = {
                jsonrpc: this.jsonrpc,
                result: { [rootKey]: [e.value] },
              };
            }
            acc.serverResponse[type] = tempObj;
          }

          // Functions injection
          if ("function" in e) {
            const callKey = `${rootKey}/call`;
            acc.functions[callKey] = acc.functions[callKey] || {};
            acc.functions[callKey][e.function.name] = e.function;
          }
          return acc;
        },
        { serverResponse: {}, functions: {} },
      );

      serverResponse = generated.serverResponse;
      functions = generated.functions;
    }

    // Evaluate parsed request bodies
    const reqObj = this.parseObj_(eventObject);
    let finalResponse = null;

    if (Array.isArray(reqObj)) {
      finalResponse = reqObj
        .map((o) => this.batchProcess_({ obj: o, serverResponse, functions }))
        .filter(Boolean);
      if (finalResponse.length === 0) return null;
    } else {
      finalResponse = this.batchProcess_({
        obj: reqObj,
        serverResponse,
        functions,
      });
    }

    if (finalResponse) {
      const dataStr = JSON.stringify(finalResponse);
      if (Array.isArray(finalResponse)) {
        this.values.push([
          this.date,
          "batch process",
          null,
          "server --> client",
          dataStr,
        ]);
      }
      return ContentService.createTextOutput(dataStr).setMimeType(
        ContentService.MimeType.JSON,
      );
    }

    return null;
  }

  /*****************************************************************************************************
   * CLIENT METHODS
   *****************************************************************************************************/

  /**
   * ### Description
   * Prepares the MCP client environment and internal configuration.
   *
   * @param {Object} object - Configuration parameters.
   * @param {string} object.apiKey - API key for the Gemini API.
   * @param {string} object.prompt - Input prompt targeting the agent.
   * @param {string[]} [object.mcpServerUrls=[]] - Valid URLs of the targeted MCP servers.
   * @param {boolean}[object.batchProcess=false] - If true, enables batch request processing towards the servers.
   * @param {Object}[object.functions] - Custom client-side tools/functions.
   * @param {Array}[object.history] - Chat history array for continuous conversation.
   * @param {Array}[object.mcpServerObj] - MCP Servers installed directly as libraries.
   * @return {MCPApp}
   */
  client(object = {}) {
    this.errorProcessForClient_(object);
    if (!Array.isArray(object.mcpServerUrls)) {
      object.mcpServerUrls = [];
    }

    this.clientInfo = { name: "MCPApp_client", version: "1.0.0" };

    /** @private */
    this.model = "models/gemini-3-flash-preview";

    /** @private */
    this.id = 0;

    /** @private */
    this.headers = { authorization: `Bearer ${ScriptApp.getOAuthToken()}` };

    this.prepareClient_(object);
    return this;
  }

  /**
   * ### Description
   * Main execution sequence for communicating with the configured MCP servers and local logic.
   * It analyzes the user prompt using the Gemini model to decide tool ordering and sequential execution.
   *
   * @return {Object} An object containing the final results array and generation history.
   */
  callMCPServers() {
    console.log("--- start: Call MCP servers or functions (client --> server)");

    if (!this.functions?.params_) {
      this.functions = { params_: {} };
    }

    let functionCallings = Object.entries(this.functions.params_).map(
      ([key, val]) => `- Name: "${key}", Details: ${JSON.stringify(val)}`,
    );
    if (functionCallings.length === 0) {
      functionCallings = ["No accessible functions currently available."];
    }

    const serverInfoArr = (this.mcpServerObj || []).reduce((acc, obj) => {
      const serverInfo = obj.initialize?.result?.serverInfo;
      if (serverInfo)
        acc.push(`Name: ${serverInfo.name}, Version: ${serverInfo.version}`);
      return acc;
    }, []);

    const mcpServerDescriptions = [
      "The available connected MCP servers are listed below:",
      ...serverInfoArr,
    ];

    const currentTimestamp = Utilities.formatDate(
      this.date,
      this.timezone,
      "yyyy-MM-dd HH:mm:ss",
    );

    const systemInstructionText = [
      "You are an expert autonomous delegator capable of assigning user requests to appropriate Model Context Protocol (MCP) server functions.",
      "You construct the optimal logical order for processing tasks leveraging available functions.",
      "<Functions>",
      "The functions available are listed below. The JSON schema defining 'Details' reflects standard function-calling schemas.",
      ...functionCallings,
      "</Functions>",
      "<Mission>",
      "- Fully analyze the purpose and utility of the provided functions.",
      "- Comprehend the nuanced requirements within the user's prompt.",
      "- Assign tasks accurately to appropriate functions in sequential execution order.",
      "- If multiple independent actions map to a single function, merge the logic within the prompt configuration for that function.",
      "- If no combination of functions can fulfill the user's prompt, resolve using your intrinsic knowledge.",
      `- Fall back to the "without_function" action exclusively to provide the final conversational response.`,
      `- If a task requires conditional halting verification between execution steps, inject the "check_process" function following that step.`,
      "</Mission>",
      "<Important>",
      "- Never fabricate responses. Output strictly factual resolutions based on functions or core knowledge.",
      "- Ask the user for clarification if the request is irreconcilably vague.",
      "- Do NOT output or suggest executable code (e.g., 'tool_code' blocks). Only provide the requested format.",
      `- Ensure all allocated tasks are terminal. Do not instruct the model to verify task completion or delivery status.`,
      `- If you require the current datetime context, use: "${currentTimestamp}" operating within timezone ${this.timezone}.`,
      "</Important>",
    ].join("\n");

    const responseSchema = {
      title: "Function Execution Ordering Strategy",
      description:
        "Define the ordered list of functions needed to resolve the task.",
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            description: "Exact name of the selected function.",
            type: "string",
          },
          task: {
            description:
              "The specific sub-task or instruction allocated to this function.",
            type: "string",
          },
        },
      },
    };

    const setupObj = {
      apiKey: this.clientObject.apiKey,
      systemInstruction: {
        parts: [{ text: systemInstructionText }],
        role: "model",
      },
      model: this.model,
      responseMimeType: "application/json",
      responseSchema,
    };

    const geminiOrchestrator = new GeminiWithFiles(setupObj);
    const orchestratorPrompt = `User's input prompt:\n<UserPrompt>${this.clientObject.prompt}</UserPrompt>`;
    const executedOrders = geminiOrchestrator.generateContent({
      q: orchestratorPrompt,
    });

    if (!Array.isArray(executedOrders) || executedOrders.length === 0) {
      const errObj = {
        error: {
          code: this.ErrorCode.InternalError,
          message:
            "Internal planning error. The model returned no execution strategy.",
        },
        jsonrpc: this.jsonrpc,
        id: this.id,
      };
      this.values.push([
        this.date,
        null,
        null,
        "Client side",
        JSON.stringify(errObj),
      ]);
      return errObj;
    }

    const orderLog = executedOrders
      .map((e, i) => `${i + 1}: [${e.name}] -> ${e.task}`)
      .join("\n");
    console.log(`Planned Execution Pipeline:\n${orderLog}`);
    console.log("--- start: Sequence Execution.");

    let conversationHistory = this.clientObject.history || [];
    const executionSystemInstruction = [
      "You are an expert executor responsible for evaluating individual function parameters using function calling.",
      "<Mission>",
      "- Evaluate the required function syntax and current objective.",
      "- Construct appropriate function arguments extrapolating from task instructions and conversation history.",
      `- Invoke "without_function" exclusively to output the final answer to the user.`,
      `- Once you have generated the final response using "without_function", finish the process immediately without confirming completion.`,
      `- If executing "check_process", thoroughly evaluate previous results to determine whether processing should halt or proceed.`,
      "</Mission>",
      "<Important>",
      "- Maintain strict adherence to factual outputs.",
      `- The current operating datetime is "${currentTimestamp}" (Timezone: ${this.timezone}).`,
      "- Readily utilize information from these available server pools:",
      "<MCPServers>",
      ...mcpServerDescriptions,
      "</MCPServers>",
      "</Important>",
    ].join("\n");

    const generationResults = [];

    for (const step of executedOrders) {
      const { name, task } = step;
      console.log(`--- Executing function: "${name}" | Objective: "${task}"`);

      const funcCallWrapper = {
        params_: { [name]: this.functions.params_[name] },
        [name]: this.functions[name],
      };

      const executeObj = {
        apiKey: this.clientObject.apiKey,
        model: this.model,
        functions: funcCallWrapper,
        systemInstruction: {
          parts: [{ text: executionSystemInstruction }],
          role: "model",
        },
        history: conversationHistory,
        toolConfig: {
          functionCallingConfig: {
            mode: "any",
            allowedFunctionNames: [name],
          },
        },
      };

      const geminiExecutor = new GeminiWithFiles(executeObj);
      const executionPrompt = `Current execution objective:\n<Task>${task}</Task>`;
      const res = geminiExecutor.generateContent({ q: executionPrompt });

      if (res && res.functionResponse) {
        try {
          if (typeof res.functionResponse === "string") {
            const funcResObj = JSON.parse(res.functionResponse);
            if (funcResObj?.result?.content) {
              generationResults.push(...funcResObj.result.content);
              const consolidatedText = funcResObj.result.content
                .filter((item) => item.type === "text")
                .map((item) => item.text)
                .join("\n");

              const lastHistoryPart =
                geminiExecutor.history[geminiExecutor.history.length - 1]
                  ?.parts?.[0];
              if (lastHistoryPart?.functionResponse?.response) {
                lastHistoryPart.functionResponse.response.content =
                  consolidatedText;
              }
            }
          } else {
            let compiledMessage = "";
            const resData = res.functionResponse;

            if (resData.task && resData.result) {
              if (name === "check_process") {
                if (resData.result.stopProcess) {
                  compiledMessage = `Process Halted. Task: ${resData.task}. Reason: ${resData.result.reason}`;
                  generationResults.push(compiledMessage);
                  break; // Stop sequential pipeline
                } else {
                  compiledMessage = `Task: ${resData.task}. Check passed, process continued.`;
                }
              } else {
                compiledMessage = `Task: ${resData.task}, Result: ${JSON.stringify(resData.result)}`;
              }
            } else if (!resData.task && resData.result) {
              compiledMessage = `Task: ${task}, Result: ${JSON.stringify(resData.result)}`;
            } else {
              compiledMessage =
                "System warning: Empty response derived from tool execution.";
            }

            generationResults.push(compiledMessage);
            const lastHistoryPart =
              geminiExecutor.history[geminiExecutor.history.length - 1]
                ?.parts?.[0];
            if (lastHistoryPart?.functionResponse?.response) {
              lastHistoryPart.functionResponse.response.content =
                compiledMessage;
            }
          }
        } catch (error) {
          console.warn(`Execution Response Parse Error: ${error.stack}`);
          generationResults.push(res.functionResponse);
          const lastHistoryPart =
            geminiExecutor.history[geminiExecutor.history.length - 1]
              ?.parts?.[0];
          if (lastHistoryPart?.functionResponse?.response) {
            lastHistoryPart.functionResponse.response.content =
              res.functionResponse;
          }
        }
      } else if (res) {
        // Fallback catch: Model abandoned function calling, exhausted limits, or returned a raw text structure.
        console.warn(
          `Execution Warning: Missing functionResponse. Model returned standard text or was aborted.`,
        );
        const fallbackText =
          typeof res === "string" ? res : res.text || JSON.stringify(res);
        generationResults.push(fallbackText);

        // Attempt to clean up the history if it reflects the aborted structure
        const lastHistoryPart =
          geminiExecutor.history[geminiExecutor.history.length - 1]?.parts?.[0];
        if (lastHistoryPart && !lastHistoryPart.functionResponse) {
          lastHistoryPart.text = fallbackText;
        }
      } else {
        generationResults.push(
          "System warning: Received completely empty response from the executor.",
        );
      }
      conversationHistory = geminiExecutor.history;
    }

    let finalOutputs = generationResults.flatMap((output) => {
      if (output?.type === "text") return output.text;
      if (typeof output === "string") return output;
      if (output?.data) {
        const fileBlob = Utilities.newBlob(
          Utilities.base64Decode(output.data),
          output.mimeType,
          "downloaded_file",
        );
        return [
          fileBlob,
          `Attachment payload successfully loaded (MIME type: ${output.mimeType}).`,
        ];
      }
      return [
        "System Warning: Received a file attachment signature, but content payload was missing.",
      ];
    });

    const standardTextResults = finalOutputs.filter(
      (e) => typeof e === "string",
    );

    // Final summarization phase if text results exist
    if (standardTextResults.length > 0) {
      const geminiSummarizer = new GeminiWithFiles({
        apiKey: this.clientObject.apiKey,
        model: this.model,
        history: conversationHistory,
      });
      const finalSummary = geminiSummarizer.generateContent({
        parts: [
          {
            text: "Synthesize the results strictly answering the user's initial prompt.",
          },
          { text: `<Question>${this.clientObject.prompt}</Question>` },
          { text: `<Answers>\n${standardTextResults.join("\n")}\n</Answers>` },
        ],
      });
      geminiOrchestrator.history = geminiSummarizer.history;
      finalOutputs = [
        finalSummary,
        ...finalOutputs.filter((e) => typeof e !== "string"),
      ];
    }

    this.values.push([
      this.date,
      null,
      null,
      "Client side",
      JSON.stringify(finalOutputs),
    ]);
    console.log("--- end: Sequence Execution completed.");

    return { result: finalOutputs, history: geminiOrchestrator.history };
  }

  /**
   * ### Description
   * Validates core properties required for MCP Client execution.
   *
   * @param {Object} object
   * @private
   */
  errorProcessForClient_(object) {
    if (!object.apiKey) {
      throw new Error(
        "Missing requirement: Gemini API Key configuration is necessary.",
      );
    }
    if (!object.prompt) {
      throw new Error(
        "Missing requirement: An operational Prompt string must be provided.",
      );
    }
  }

  /**
   * ### Description
   * Utility to safely merge function parameter dictionaries without overwriting core states.
   *
   * @param {Object} funcDictA
   * @param {Object} funcDictB
   * @return {Object} Merged function object mapping.
   * @private
   */
  mergeFunctions_(funcDictA, funcDictB) {
    const mergedParams = { ...funcDictA.params_, ...funcDictB.params_ };
    const extractFuncs = Object.keys(funcDictB.params_).reduce((acc, k) => {
      acc[k] = funcDictB[k];
      return acc;
    }, {});

    return { ...funcDictA, ...extractFuncs, params_: mergedParams };
  }

  /**
   * ### Description
   * Instantiates fundamental tools and orchestrates them alongside user-configured and server-provided tools.
   *
   * @param {Object} serverProvidedFuncs
   * @param {Object} userCustomFuncs
   * @return {Object} Unified toolkit.
   * @private
   */
  getClientFunctions_(serverProvidedFuncs, userCustomFuncs) {
    let baseToolkit = {
      params_: {
        without_function: {
          description:
            "Use this exclusively to provide the final conversational response to the user when other tools cannot resolve the task. Do NOT use this to confirm task completion. Output only the final answer.",
          parameters: {
            type: "object",
            properties: {
              task: {
                type: "string",
                description: "Detailed description of the task requirements.",
              },
              response: {
                type: "string",
                description:
                  "The final answer or conversational response to the user.",
              },
            },
            required: ["task", "response"],
          },
        },
        check_process: {
          description:
            "Inspect conversational history logs and decide whether the orchestration must halt prematurely due to errors or achieved states.",
          parameters: {
            type: "object",
            properties: {
              stopProcess: {
                type: "boolean",
                description:
                  "Return True to entirely halt processing, False to proceed to the next operation.",
              },
              task: {
                type: "string",
                description: "The task being evaluated.",
              },
              reason: {
                type: "string",
                description:
                  "The descriptive cause backing the halt or continuation decision.",
              },
            },
            required: ["stopProcess", "task", "reason"],
          },
        },
      },
      without_function: ({ task, response }) => {
        console.log(
          `--- Executing intrinsic handler: without_function | Prompt: ${task}`,
        );
        return { task, result: response };
      },
      check_process: ({ stopProcess, task, reason }) => {
        console.log(
          `--- Check Process Triggered | Task: ${task} | Halting: ${stopProcess} | Reason: ${reason}`,
        );
        return { task, result: { stopProcess, reason } };
      },
    };

    if (
      serverProvidedFuncs?.params_ &&
      Object.keys(serverProvidedFuncs).length > 1
    ) {
      baseToolkit = this.mergeFunctions_(baseToolkit, serverProvidedFuncs);
    }

    if (userCustomFuncs?.params_ && Object.keys(userCustomFuncs).length > 1) {
      baseToolkit = this.mergeFunctions_(baseToolkit, userCustomFuncs);
    }

    return baseToolkit;
  }

  /**
   * ### Description
   * Constructs network requests properly routing standard URLs vs GAS Web Apps.
   *
   * @param {Object} object
   * @return {Object} Valid configurations for UrlFetchApp.
   * @private
   */
  createRequest_({ u, obj }) {
    const rawUrl = u.trim();
    const { url, queryParameters } = this.parseQueryParameters_(rawUrl);
    const urlSegment = url.split("/").pop();
    const fullUrl = this.addQueryParameters_(url.trim(), queryParameters || {});

    const requestConfig = {
      url: fullUrl,
      payload: obj,
      muteHttpExceptions: true,
    };

    // Authenticate if connecting to GAS-deployed executions
    if (["exec", "dev"].includes(urlSegment)) {
      requestConfig.headers = this.headers;
    }

    return requestConfig;
  }

  /**
   * ### Description
   * Dispatches targeted capability requests to all bound MCP Servers.
   *
   * @param {string} method - Request capability standard method (e.g., resources/list).
   * @return {Object[]} List of crafted Request Objects.
   * @private
   */
  getRequest_(method) {
    this.id++;
    const payloadStr = JSON.stringify({
      method,
      params: {},
      jsonrpc: this.jsonrpc,
      id: this.id,
    });
    return this.mcpServerObj.map(({ serverUrl }) =>
      this.createRequest_({ u: serverUrl, obj: payloadStr }),
    );
  }

  /**
   * ### Description
   * Executes network fetches to synchronize capability lists from bound MCP Servers.
   *
   * @param {Object} object
   * @private
   */
  getLists_({ method, requests }) {
    this.fetch_(requests).forEach((response, index) => {
      const targetUrl = requests[index].url;
      const matchingServerIndex = this.mcpServerObj.findIndex(
        (srv) => srv.serverUrl === targetUrl,
      );

      if (response.getResponseCode() === 200 && matchingServerIndex > -1) {
        try {
          const parsedRes = JSON.parse(response.getContentText());
          if (parsedRes?.result) {
            this.mcpServerObj[matchingServerIndex][method] = parsedRes.result;
          }
        } catch (error) {
          // Silent catch to continue loop resilience
        }
      }
    });
  }

  /**
   * ### Description
   * Parses server arrays dynamically using batch processing for execution efficiency.
   *
   * @param {Object} object
   * @private
   */
  parseBatchProcess_({ mcpServerUrls, reqs }) {
    const payloadMap = mcpServerUrls.reduce((acc, url) => {
      acc[url] = { url, payload: [] };
      return acc;
    }, {});

    reqs.forEach(({ requests }) => {
      requests.forEach(({ url, payload }) => {
        if (payloadMap[url]) {
          payloadMap[url].payload.push(JSON.parse(payload));
        }
      });
    });

    const compiledArray = Object.values(payloadMap).filter(
      (entry) => entry.payload.length > 0,
    );
    const methodIdMapArray = compiledArray.map((entry) =>
      entry.payload.reduce((mapAcc, { method, id }) => {
        mapAcc[id] = method;
        return mapAcc;
      }, {}),
    );

    const requestPool = compiledArray.map((entry) =>
      this.createRequest_({ u: entry.url, obj: JSON.stringify(entry.payload) }),
    );

    if (requestPool.length > 0) {
      this.fetch_(requestPool).forEach((response, i) => {
        const targetUrl = requestPool[i].url;
        const matchingServerIndex = this.mcpServerObj.findIndex(
          (srv) => srv.serverUrl === targetUrl,
        );

        if (response.getResponseCode() === 200 && matchingServerIndex > -1) {
          try {
            const parsedArray = JSON.parse(response.getContentText());
            parsedArray.forEach((resChunk) => {
              if (resChunk?.result) {
                const triggerMethod = methodIdMapArray[i][resChunk.id];
                this.mcpServerObj[matchingServerIndex][triggerMethod] =
                  resChunk;
              }
            });
          } catch (error) {
            // Processing failure intentionally omitted for stability.
          }
        }
      });
    }
  }

  /**
   * ### Description
   * Converts MCP Server resources and tools into dynamically bound JavaScript functions executable by Gemini API.
   * Ensures function contexts correctly align back to the server requests.
   *
   * @private
   */
  createFunctions_() {
    const routingMap = {
      "resources/list": "resources/read",
      "prompts/list": "prompts/get",
      "tools/list": "tools/call",
    };
    const validEndpoints = Object.keys(routingMap);

    const fetchWrapper = ({ payload, serverUrl }) => {
      const responseArray = this.fetch_([
        this.createRequest_({ u: serverUrl, obj: JSON.stringify(payload) }),
      ]);
      return responseArray[0].getContentText();
    };

    const aggregatedServerTools = this.mcpServerObj.reduce(
      (accumulator, serverEntry) => {
        const { serverUrl } = serverEntry;

        validEndpoints.forEach((endpointKey) => {
          const subKey = endpointKey.split("/")[0];
          const resourceResult =
            serverEntry[endpointKey]?.result ?? serverEntry[endpointKey];
          const toolArray = resourceResult?.[subKey] ?? [];

          toolArray.forEach((definition) => {
            const { name, description, uri, inputSchema } = definition;
            const cleanName = name.replaceAll(" ", "_").trim();
            let toolMetadata = null;
            let executionCallback = null;

            if (subKey === "resources") {
              toolMetadata = { title: name, description };
              executionCallback = () => {
                console.log(`--- Fetching Resource Execution: ${cleanName}`);
                const dispatchPayload = {
                  method: routingMap[endpointKey],
                  params: { uri },
                  jsonrpc: this.jsonrpc,
                  id: this.id++,
                };
                return fetchWrapper({ payload: dispatchPayload, serverUrl });
              };
            } else if (subKey === "prompts") {
              const propMap = definition.arguments.reduce((mapAcc, argObj) => {
                mapAcc[argObj.name.replaceAll(" ", "_").trim()] = {
                  type: "string",
                  description: argObj.description,
                };
                return mapAcc;
              }, {});

              toolMetadata = {
                title: name,
                description,
                parameters: {
                  type: "object",
                  properties: propMap,
                  required: Object.keys(propMap),
                },
              };
              executionCallback = (params) => {
                console.log(`--- Generating Prompt Logic: ${cleanName}`);
                const dispatchPayload = {
                  method: routingMap[endpointKey],
                  params: { name: cleanName, arguments: params },
                  jsonrpc: this.jsonrpc,
                  id: this.id++,
                };
                return fetchWrapper({ payload: dispatchPayload, serverUrl });
              };
            } else if (subKey === "tools") {
              toolMetadata = {
                title: name,
                description,
                parameters: inputSchema,
              };
              executionCallback = (params) => {
                console.log(`--- Activating Tool Service: ${cleanName}`);
                const dispatchPayload = {
                  method: routingMap[endpointKey],
                  params: { name: cleanName, arguments: params },
                  jsonrpc: this.jsonrpc,
                  id: this.id++,
                };
                return fetchWrapper({ payload: dispatchPayload, serverUrl });
              };
            }

            if (toolMetadata && executionCallback) {
              accumulator.params_[cleanName] = {
                title: name,
                description,
                ...toolMetadata,
              };
              accumulator[cleanName] = executionCallback;
            }
          });
        });
        return accumulator;
      },
      { params_: {} },
    );

    let finalUserTools = null;
    if (
      this.clientObject.functions?.params_ &&
      Object.keys(this.clientObject.functions).length > 1
    ) {
      finalUserTools = { ...this.clientObject.functions };
    }

    const integratedToolkit = this.getClientFunctions_(
      aggregatedServerTools,
      finalUserTools,
    );

    if (integratedToolkit.params_) {
      console.log(
        `Capabilities mapped: ${Object.keys(integratedToolkit.params_).length} distinct operations loaded.`,
      );
    }

    /** @private */
    this.functions = integratedToolkit;
  }

  /**
   * ### Description
   * Initiates the protocol handshakes for server discovery, caching supported models, tools, and capabilities.
   *
   * @param {Object} object
   * @return {MCPApp}
   * @private
   */
  prepareClient_(object) {
    this.clientObject = object;
    const {
      mcpServerUrls,
      batchProcess = false,
      mcpServerObj,
    } = this.clientObject;

    // Load pre-installed Server Object library boundaries
    if (Array.isArray(mcpServerObj) && mcpServerObj.length > 0) {
      const flatLibTools = mcpServerObj.flat().reduce(
        (acc, entry) => {
          if (entry.type === "tools/list") {
            const schemaKey = entry.value.name;
            acc[schemaKey] = entry.function;
            acc.params_[schemaKey] = {
              name: schemaKey,
              description: entry.value.description,
              parameters: entry.value.inputSchema,
            };
          }
          return acc;
        },
        { params_: {} },
      );

      if (
        this.clientObject.functions?.params_ &&
        Object.keys(this.clientObject.functions).length > 1
      ) {
        this.clientObject.functions = this.mergeFunctions_(
          this.clientObject.functions,
          flatLibTools,
        );
      } else {
        this.clientObject.functions = flatLibTools;
      }
    }

    if (Array.isArray(mcpServerUrls) && mcpServerUrls.length > 0) {
      // Execute Protocol Initializations
      const methodInit = "initialize";
      console.log(`--- Executing Handshake: ${methodInit} (Client --> Server)`);

      const payloadInit = {
        method: methodInit,
        params: {
          protocolVersion: this.protocolVersion,
          capabilities: {},
          clientInfo: this.clientInfo,
        },
        jsonrpc: this.jsonrpc,
        id: ++this.id,
      };

      const requestsInit = mcpServerUrls.map((url) =>
        this.createRequest_({ u: url, obj: JSON.stringify(payloadInit) }),
      );

      this.mcpServerObj = this.fetch_(requestsInit).reduce(
        (acc, response, idx) => {
          if (response.getResponseCode() === 200) {
            const bodyText = response.getContentText();
            this.values.push([
              this.date,
              methodInit,
              this.id,
              "server --> client",
              bodyText,
            ]);
            try {
              acc.push({
                serverUrl: mcpServerUrls[idx].trim(),
                [methodInit]: JSON.parse(bodyText),
              });
            } catch (e) {
              console.warn(
                `Critical Format Error. Payload from "${mcpServerUrls[idx]}" is not standard MCP JSON. Snippet: ${bodyText.substring(0, 50)}...`,
              );
              acc.push({
                serverUrl: mcpServerUrls[idx].trim(),
                [methodInit]: null,
              });
            }
          }
          return acc;
        },
        [],
      );

      // Commit Connection Registrations
      const methodNotifyInit = "notifications/initialized";
      const methodNotifyCancel = "notifications/cancelled";
      console.log(
        `--- Confirming Connections: ${methodNotifyInit} / ${methodNotifyCancel}`,
      );

      const payloadNotifyInit = {
        method: methodNotifyInit,
        jsonrpc: this.jsonrpc,
      };
      const payloadNotifyCancel = {
        method: methodNotifyCancel,
        params: {
          requestId: this.id,
          reason: `Halted: Integration failure. InternalError code ${this.ErrorCode.InternalError}`,
          jsonrpc: this.jsonrpc,
        },
      };

      const categorizedReqs = this.mcpServerObj.reduce(
        (acc, serverObj) => {
          const payloadStr = JSON.stringify(
            serverObj[methodInit] ? payloadNotifyInit : payloadNotifyCancel,
          );
          const configTarget = serverObj[methodInit]
            ? acc.notifiedReqs
            : acc.canceledReqs;
          configTarget.push(
            this.createRequest_({ u: serverObj.serverUrl, obj: payloadStr }),
          );
          return acc;
        },
        { notifiedReqs: [], canceledReqs: [] },
      );

      if (categorizedReqs.notifiedReqs.length === 0) {
        this.values.push([
          this.date,
          methodNotifyInit,
          this.id,
          "At client",
          "Fatal: No servers responded to initialized capability.",
        ]);
        return this;
      }

      if (categorizedReqs.canceledReqs.length > 0) {
        const cancelledLogs = this.fetch_(categorizedReqs.canceledReqs).map(
          (res) => res.getContentText(),
        );
        console.log(`Connection Removals Triggered:`, cancelledLogs);
      }

      this.fetch_(categorizedReqs.notifiedReqs);

      // Mapping Server Tool Capabilities
      const resourceMethods = ["resources/list", "prompts/list", "tools/list"];
      const capabilityJobs = resourceMethods.map((m) => ({
        method: m,
        requests: this.getRequest_(m),
      }));

      if (batchProcess) {
        console.log("--- Extracting Tool Lists (Batch Transmission Protocol)");
        this.parseBatchProcess_({ mcpServerUrls, reqs: capabilityJobs });
      } else {
        console.log("--- Extracting Tool Lists (Linear Transmission Protocol)");
        capabilityJobs.forEach((job) => this.getLists_(job));
      }

      this.createFunctions_();
    } else {
      console.log("--- Status Warning: No remote MCP Server URLs assigned.");
      this.values.push([
        this.date,
        null,
        null,
        "At client",
        "No MCP Server URLs provided.",
      ]);

      let manualFunctions = null;
      if (
        this.clientObject.functions?.params_ &&
        Object.keys(this.clientObject.functions).length > 1
      ) {
        manualFunctions = { ...this.clientObject.functions };
      }

      const localToolkit = this.getClientFunctions_(null, manualFunctions);
      if (localToolkit.params_) {
        console.log(
          `Locally executing capabilities. Distinct operations mapped: ${Object.keys(localToolkit.params_).length}`,
        );
      }

      /** @private */
      this.functions = localToolkit;
    }

    return this;
  }

  /*****************************************************************************************************
   * TOOLS & UTILITIES
   *****************************************************************************************************/

  /**
   * ### Description
   * Exposes configured and dynamically imported tools configured in the agent network.
   *
   * @return {Object} Dictionary mappings containing tool executors.
   */
  get getFunctions() {
    return this.functions;
  }

  /**
   * ### Description
   * Bulk execution framework wrapping GAS UrlFetchApp mechanism.
   *
   * @param {Object[]} requests - UrlFetchApp payload configuration objects.
   * @return {GoogleAppsScript.URL_Fetch.HTTPResponse[]}
   * @private
   */
  fetch_(requests) {
    return UrlFetchApp.fetchAll(requests);
  }

  /**
   * ### Description
   * Extrapolates request mapping content correctly, accounting for raw text parsing.
   *
   * @param {Object} e - DoPost Google Event payload.
   * @return {Object|null}
   * @private
   */
  parseObj_(e) {
    if (e?.postData?.contents) {
      return JSON.parse(e.postData.contents);
    }
    // Implement parameter parsing map if GET protocol structures become permitted.
    return null;
  }

  /**
   * ### Description
   * Analyzes an endpoint path returning distinct query object separations.
   *
   * @param {string} url - Valid string path.
   * @return {Object|null}
   * @private
   */
  parseQueryParameters_(url) {
    if (typeof url !== "string") {
      throw new Error(
        "Invalid format. Provided URL definition must be a string format.",
      );
    }

    const parts = url.split("?");
    if (parts.length === 1) return { url: parts[0], queryParameters: null };

    const [baseUrl, query] = parts;
    if (query) {
      const queryParameters = query.split("&").reduce((acc, paramBlock) => {
        const [keyRaw, valRaw] = paramBlock.split("=");
        const key = keyRaw.trim();
        const valueStr = valRaw.trim();
        const valueDecoded = isNaN(valueStr) ? valueStr : Number(valueStr);

        if (acc[key]) acc[key].push(valueDecoded);
        else acc[key] = [valueDecoded];

        return acc;
      }, {});
      return { url: baseUrl, queryParameters };
    }
    return null;
  }

  /**
   * ### Description
   * Applies parameterized attributes sequentially building valid REST URLs.
   *
   * @param {string} url - Unformatted base endpoint.
   * @param {Object} obj - Parameters tree schema.
   * @return {string}
   * @private
   */
  addQueryParameters_(url, obj) {
    if (typeof url !== "string" || !obj) {
      throw new Error(
        "Validation mismatch. Valid string URL and object config must be supplied.",
      );
    }
    const params = Object.entries(obj);
    if (params.length === 0) return url;

    const queryString = params
      .flatMap(([key, value]) =>
        Array.isArray(value)
          ? value.map(
              (entry) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(entry)}`,
            )
          : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      )
      .join("&");

    return `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
  }

  /**
   * ### Description
   * Transmits generated diagnostic arrays effectively truncating data to enforce GAS row integrity limits (Max 50k chars).
   *
   * @return {void}
   * @private
   */
  log_() {
    if (!this.sheet || this.values.length === 0) return;
    const sanitizedData = this.values.map((row) =>
      row.map((cell) =>
        typeof cell === "string" ? cell.substring(0, 40000) : cell,
      ),
    );
    this.sheet
      .getRange(
        this.sheet.getLastRow() + 1,
        1,
        sanitizedData.length,
        sanitizedData[0].length,
      )
      .setValues(sanitizedData);
  }
}
