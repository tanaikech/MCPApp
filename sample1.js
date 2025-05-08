/**
 * This function retrieves the file metadata from the specific folder on Google Drive.
 * 
 * This function is run by "tools/call".
 * "tools/call": The function name is required to be the same as the name declared at "tools/list".
 */
function search_files_on_Google_Drive(args) {
  const { folderName } = args;
  try {
    const res = [];
    const folders = DriveApp.getFoldersByName(folderName);
    while (folders.hasNext()) {
      const folder = folders.next();
      const files = folder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        res.push({ filename: file.getName(), mimeType: file.getMimeType() });
      }
    }
    const text = res.map(({ filename, mimeType }) => `Filename is ${filename}. MimeType is ${mimeType}.`).join("\n");
    return {
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text }], isError: false }
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text: err.message }], isError: true }
    };
  }
}

/**
 * This function retrieves events from the specific date on Google Calendar.
 * 
 * This function is run by "tools/call".
 * "tools/call": The function name is required to be the same as the name declared at "tools/list".
 */
function search_schedule_on_Google_Calendar(args) {
  const { date } = args;
  try {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const events = CalendarApp.getDefaultCalendar().getEvents(start, end); // or CalendarApp.getCalendarById("###").getEvents(start, end);
    const timeZone = Session.getScriptTimeZone();
    const text = events.map(e => `${Utilities.formatDate(e.getStartTime(), timeZone, "HH:mm")}-${Utilities.formatDate(e.getEndTime(), timeZone, "HH:mm")}: ${e.getTitle()}`).join("\n");
    return {
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text }], isError: false }
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text: err.message }], isError: true }
    };
  }
}

/**
 * This function retrieves today's events on Google Calendar.
 * 
 * This function is run by "resources/read".
 * "resources/read": The function name is required to be the same as the uri declared at "resources/list".
 */
function get_today_schedule() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  const events = CalendarApp.getDefaultCalendar().getEvents(start, end); // or CalendarApp.getCalendarById("###").getEvents(start, end);
  const timeZone = Session.getScriptTimeZone();
  const contents = events.map(e => ({
    uri: e.getTitle(),
    mimeType: "text/plain",
    text: `${Utilities.formatDate(e.getStartTime(), timeZone, "HH:mm")}-${Utilities.formatDate(e.getEndTime(), timeZone, "HH:mm")}: ${e.getTitle()}`
  }));
  return { jsonrpc: "2.0", result: { contents } };
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
    "initialize": {
      "jsonrpc": "2.0",
      "result": {
        "protocolVersion": "2024-11-05", // or "2025-03-26"
        "capabilities": {
          "experimental": {},
          "prompts": {
            "listChanged": false
          },
          "resources": {
            "subscribe": false,
            "listChanged": false
          },
          "tools": {
            "listChanged": false
          }
        },
        "serverInfo": {
          "name": "sample server from MCPApp",
          "version": "1.0.0"
        }
      }
    },

    /**
     * Response to "tools/list"
     */
    "tools/list": {
      "jsonrpc": "2.0",
      "result": {
        "tools": [
          {
            "name": "search_files_on_Google_Drive", // <--- It is required to create a function of the same name as this.
            "description": "Search files on Google Drive.",
            "inputSchema": {
              "type": "object",
              "properties": {
                "folderName": { "description": "Search files in the folder of this folder name.", "type": "string" },
              },
              "required": ["folderName"],
            }
          },
          {
            "name": "search_schedule_on_Google_Calendar", // <--- It is required to create a function of the same name as this.
            "description": "Search the schedule on Google Calendar.",
            "inputSchema": {
              "type": "object",
              "properties": {
                "date": { "description": "Search the schedule on Google Calendar by giving the date.", "type": "string", "format": "date" },
              },
              "required": ["date"],
            }
          },
        ]
      }
    },

    /**
     * Response to "resources/list"
     */
    "resources/list": {
      "jsonrpc": "2.0",
      "result": {
        "resources": [{
          "uri": "get_today_schedule", // <--- It is required to create a function of the same name as this.
          "name": "today_schedule",
          "description": "Today's schedule for Tanaike.",
          "mimeType": "text/plain"
        }],
        "nextCursor": "next-page-cursor"
      }
    },

    /**
     * Response to "prompts/list"
     */
    "prompts/list": {
      "jsonrpc": "2.0",
      "result": {
        "prompts": [
          {
            "name": "search_files_from_Google_Drive",
            "description": "Search files in the specific folder on Google Drive using tools.",
            "arguments": [
              {
                "name": "search_files",
                "description": "Search files.",
                "required": true
              }
            ]
          }
        ],
        "nextCursor": "next-page-cursor"
      }
    },

    /**
     * Response to "prompts/get"
     */
    "prompts/get": {
      "jsonrpc": "2.0",
      "result": {
        "description": "Search files in the specific folder on Google Drive.",
        "messages": [
          {
            "role": "user",
            "content": {
              "type": "text",
              "text": "Return file information from a folder of 'sample' on Google Drive."
            }
          }
        ]
      }
    }
  };
}

/**
 * "tools/call": The function name is required to be the same as the name declared at "tools/list".
 * "resources/read": The function name is required to be the same as the uri declared at "resources/list".
 */
function getFunctions_() {
  return {
    "tools/call": { search_files_on_Google_Drive, search_schedule_on_Google_Calendar },
    "resources/read": { get_today_schedule }
  };
}

/**
 * This function is automatically run when the MCP client accesses Web Apps.
 */
function doPost(eventObject) {
  const object = { eventObject, serverResponse: getserverResponse_(), functions: getFunctions_() };
  return new MCPApp.mcpApp({ accessKey: "sample" }).server(object);
  
  // If you want to use this library by directly pasting in your script editor, please use the following script.
  // return new MCPApp({ accessKey: "sample" }).server(object);
}
