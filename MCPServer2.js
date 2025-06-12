/**
 * This function gets events from Google Calendar.
 */
function get_schedule_from_Google_Calendar(args) {
  const { startDatetime, endDatetime, searchText } = args;
  try {
    const cal = CalendarApp.getDefaultCalendar(); // or CalendarApp.getCalendarById("###");
    const argObj = [Utilities.parseDate(startDatetime, timeZone, "yyyy-MM-dd HH:mm:ss"), Utilities.parseDate(endDatetime, timeZone, "yyyy-MM-dd HH:mm:ss")];
    if (searchText) {
      argObj.push({ search: searchText });
    }
    const timeZone = Session.getScriptTimeZone();
    const events = cal.getEvents(...argObj).map(e => {
      const title = e.getTitle();
      const startTime = Utilities.formatDate(e.getStartTime(), timeZone, "yyyy-MM-dd HH:mm:ss");
      const endTime = Utilities.formatDate(e.getEndTime(), timeZone, "yyyy-MM-dd HH:mm:ss");
      const description = e.getDescription();
      return `Title: ${title}, StartTime: ${startTime}, EndTime: ${endTime}, Description: ${description}`;
    });
    let text = "";
    if (events.length > 0) {
      text = [
        "Retrieved schedules are as follows.",
        ...events,
      ].join("\n");
    } else {
      text = "No schedules were found.";
    }
    console.log(text); // Check response.
    return {
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text }], isError: false }
    };
  } catch (err) {
    console.log(err.stack);
    return {
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text: err.message }], isError: true }
    };
  }
}

/**
 * This function creates an event to Google Calendar.
 */
function create_schedule_to_Google_Calendar(args) {
  const { obj } = args;
  try {
    let text = "No events were created.";
    if (obj.length > 0) {
      const cal = CalendarApp.getDefaultCalendar(); // or CalendarApp.getCalendarById("###");
      const timeZone = Session.getScriptTimeZone();
      text = obj.map(({ startDatetime, endDatetime, title, description }) => {
        cal.createEvent(
          title,
          Utilities.parseDate(startDatetime, timeZone, "yyyy-MM-dd HH:mm:ss"),
          Utilities.parseDate(endDatetime, timeZone, "yyyy-MM-dd HH:mm:ss")
        ).setDescription(description);
        return `An event was created as Start: ${startDatetime}, End: ${endDatetime}, Title: ${title}, Description: ${description}`;
      }).join("\n");
    }
    console.log(text); // Check response.
    return {
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text }], isError: false }
    };
  } catch (err) {
    console.log(err.stack);
    return {
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text: err.message }], isError: true }
    };
  }
}

/**
 * Please set and modify the following JSON to your situation.
 * The key is the method from the MCP client.
 * The value is the object for returning to the MCP client.
 * ID is automatically set in the script.
 * The specification of this can be seen in the official document.
 * Ref: https://modelcontextprotocol.io/specification/2025-03-26
 */
var items = [
  {
    "type": "initialize",
    "value": {
      "protocolVersion": "2024-11-05", // or "2025-03-26"
      "capabilities": { "tools": { "listChanged": false } },
      "serverInfo": { "name": "MCP server for managing Google Calendar by MCPApp", "version": "1.0.0" }
    }
  },
  {
    "type": "tools/list",
    "function": get_schedule_from_Google_Calendar,
    "value": {
      name: "get_schedule_from_Google_Calendar", // <--- It is required to create a function of the same name as this.
      description: "Get events (schedules) from Google Calendar.",
      inputSchema: {
        type: "object",
        properties: {
          startDatetime: { description: `Start datetime of the event (schedule). The format of the date should be ISO format ("yyyy-MM-dd HH:mm:ss").`, type: "string" },
          endDatetime: { description: `End datetime of the event (schedule). The format of the date should be ISO format ("yyyy-MM-dd HH:mm:ss").`, type: "string" },
          title: { description: `Title of event (schedule).`, type: "string" },
          description: { description: `Description of event (schedule).`, type: "string" },
        },
        required: ["startDatetime", "endDatetime", "title", "description"]
      }
    }
  },
  {
    "type": "tools/list",
    "function": create_schedule_to_Google_Calendar,
    "value": {
      name: "create_schedule_to_Google_Calendar", // <--- It is required to create a function of the same name as this.
      description: "Create events (schedule) to Google Calendar.",
      inputSchema: {
        type: "object",
        properties: {
          obj: {
            type: "array",
            description: "Array including the values for creating events.",
            items: {
              type: "object",
              properties: {
                startDatetime: { description: `Start datetime of the event (schedule). The format of the date should be ISO format ("yyyy-MM-dd HH:mm:ss").`, type: "string" },
                endDatetime: { description: `End datetime of the event (schedule). The format of the date should be ISO format ("yyyy-MM-dd HH:mm:ss").`, type: "string" },
                title: { description: `Title of event (schedule).`, type: "string" },
                description: { description: `Description of event (schedule).`, type: "string" },
              },
              required: ["startDatetime", "endDatetime", "title", "description"]
            }
          }
        }
      }
    }
  },
];


/**
 * This function is automatically run when the MCP client accesses Web Apps.
 */
const doPost = e => main(e);

function main(eventObject) {
  const object = { eventObject, items };
  return new MCPApp
    .mcpApp({ accessKey: "sample" })
    .setServices({ lock: LockService.getScriptLock() })
    .server(object);
}

/**
 * This function is used for retrieving the URL of the Web Apps.
 * Please directly run this function and copy the URL from the log.
 */
function getServerURL() {
  const serverURL = `${ScriptApp.getService().getUrl()}?accessKey=sample`;
  console.log(serverURL);


  // The following comment line is used for automatically detecting the scope of "https://www.googleapis.com/auth/drive.readonly". This scope is used for accessing Web Apps. So, please don't remove the comment.
  // DriveApp.getFiles();
}
