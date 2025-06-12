/**
 * This function retrieves an image by searching Google Drive.
 *
 * This function is run by "tools/call".
 * "tools/call": The function name is required to be the same as the name declared at "tools/list".
 */
function get_image(args) {
  const { filename } = args;
  let result;
  try {
    const files = DriveApp.searchFiles(
      `title contains '${filename}' and mimeType contains 'image' and trashed=false`
    );
    if (files.hasNext()) {
      const file = files.next();
      result = {
        content: [
          {
            type: "text",
            text: `Actual filename on Google Drive is ${file.getName()}.`,
          },
          {
            type: "image",
            data: Utilities.base64Encode(file.getBlob().getBytes()),
            mimeType: file.getMimeType(),
          },
        ],
        isError: false,
      };
    } else {
      result = {
        content: [{ type: "text", text: `There is no file of "${filename}".` }],
        isError: true,
      };
    }
  } catch (err) {
    result = { content: [{ type: "text", text: err.message }], isError: true };
  }
  return { jsonrpc: "2.0", result };
}

/**
 * Please set and modify the following JSON to your situation.
 * The key is the method from the MCP client.
 * The value is the object for returning to the MCP client.
 * ID is automatically set in the script.
 * The specification of this can be seen in the official document.
 * Ref: https://modelcontextprotocol.io/specification/2025-03-26
 */
function getserverResponse_() {
  return {
    /**
     * Response to "initialize"
     */
    initialize: {
      jsonrpc: "2.0",
      result: {
        protocolVersion: "2024-11-05", // or "2025-03-26"
        capabilities: {
          experimental: {},
          prompts: {
            listChanged: false,
          },
          resources: {
            subscribe: false,
            listChanged: false,
          },
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "sample server from MCPApp",
          version: "1.0.0",
        },
      },
    },

    /**
     * Response to "tools/list"
     */
    "tools/list": {
      jsonrpc: "2.0",
      result: {
        tools: [
          {
            name: "get_image", // <--- It is required to create a function of the same name as this.
            description: "Get image from Google Drive.",
            inputSchema: {
              type: "object",
              properties: {
                filename: {
                  description: "Get image of this filename from Google Drive.",
                  type: "string",
                },
              },
              required: ["filename"],
            },
          },
        ],
      },
    },
  };
}

/**
 * "tools/call": The function name is required to be the same as the name declared at "tools/list".
 * "resources/read": The function name is required to be the same as the uri declared at "resources/list".
 */
function getFunctions_() {
  return { "tools/call": { get_image } };
}

/**
 * This function is automatically run when the MCP client accesses Web Apps.
 */
function doPost(eventObject) {
  const object = {
    eventObject,
    serverResponse: getserverResponse_(),
    functions: getFunctions_(),
  };
  return new MCPApp.mcpApp({ accessKey: "sample" }).setServices({ lock: LockService.getScriptLock() }).server(object);
}
