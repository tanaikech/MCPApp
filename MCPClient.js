const apiKey = "###"; // Please set your API key.

// Please set your Web Apps URLs of the MCP servers.
const mcpServerUrls = [
  "https://script.google.com/macros/s/###/dev?accessKey=sample",
  "https://script.google.com/macros/s/###/dev?accessKey=sample",
];

function mcpClient() {
  const emails = ["###"]; // When this is set, the draft mails are created to the emails of these email address.

  const now = Date.now();
  const nowStr = Utilities.formatDate(new Date(now), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  const prop = PropertiesService.getScriptProperties();
  prop.setProperty("runTime", nowStr);
  let runTime = prop.getProperty("runTime");
  if (!runTime) {
    runTime = Utilities.formatDate(new Date(now - (30 * 60 * 1000)), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  }
  prompt = [
    `Your mission is as follows.`,
    `<Mission>`,
    `1. Get message IDs of the processed messages from Google Sheets.`,
    `2. Get emails from Gmail. In this case, exclude the messages that have already been processed by checking the message IDs retrieved from Google Sheets. If new messages were not found, stop this process.`,
    `3. Add the suitable labels to each email by understanding each email body.`,
    `4. Think of suitable messages to reply to each email with the information from "AboutMe" by understanding the message bodies of each sender. And, create them as draft emails. In this case, create the draft emails to the emails from only the emails from the following sender email.<Emails>${emails.join(",")}</Emails>`,
    `5. If it is required to create a schedule by understanding each message body, create events for each message on Google Calendar.`,
    `6. Put the message IDs of the messages processed in this time into Google Sheets.`,
    `7. Return the URLs of the created draft emails and the titles of the emails as the output. And also, return whether all processes were successfully finished.`,
    `</Mission>`,
    `<Important>`,
    `- If an error occurs, stop the process on the way.`,
    `- Previous run time of the script is "${runTime}". When you retrieve the messages, retrieve the new messages from "${runTime}" to the current time.`,
    `</Important>`,
    `<AboutMe>`,
    `- My name is Tanaike.`,
    `- I like seafood and soba noodles.`,
    `</AboutMe>`,
  ].join("\n");

  // Additional functions.
  const functions = {
    params_: {
      getMessageIdsFromCells: {
        description: "Use this to get message IDs of emails in Gmail from Google Sheets.",
      },
      putMessageIdsToCells: {
        description: [
          "Use this to put values of message IDs of emails into Google Sheets.",
          "In this case, even when the message IDs are not found, it is not required to stop the process. Continue the process.",
        ].join("\n"),
        parameters: {
          type: "object",
          description: "This value is required to be 2-dimensional array. This array is used to put into Google Sheets.",
          properties: {
            values: {
              type: "array",
              items: {
                type: "array",
                items: {
                  type: "string",
                  description: "Message ID of email in Gmail."
                }
              }
            }
          },
          required: ["values"]
        }
      }
    },

    getMessageIdsFromCells: () => {
      let res;
      try {
        const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = activeSpreadsheet.getSheetByName("messageIds") || activeSpreadsheet.insertSheet("messageIds");
        const lastRow = sheet.getLastRow();
        let messageIds = [["No message IDs."]];
        if (lastRow > 0) {
          messageIds = sheet.getRange(1, 1, lastRow).getValues().flat();
        }
        res = [
          `Message IDs from Google Sheets are as follows. These message IDs correspond to the emails that have already been processed.`,
          "<MessageId>",
          messageIds.join(","),
          "</MessageId>",
        ].join("\n");
      } catch ({ stack }) {
        res = stack;
      }
      return { result: res };
    },

    putMessageIdsToCells: (args = {}) => {
      const { values } = args;
      let res;
      try {
        if (values.length > 0) {
          const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
          const sheet = activeSpreadsheet.getSheetByName("messageIds") || activeSpreadsheet.insertSheet("messageIds");
          sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
          res = `${values.length} items were added to the ${sheet.getSheetName()} sheet.`;
        } else {
          res = `No emails were processed.`;
        }
      } catch ({ stack }) {
        res = stack;
      }
      return { result: res };
    }

  };

  const object = { apiKey, prompt, mcpServerUrls, batchProcess: true, functions };
  const m = new MCPApp.mcpApp().client(object);
  const obj = m.callMCPServers();
  if (!obj.history || !obj.result) {
    return { history: [], result: ["Internal error. Please try again."] };
  }
  obj.result = obj.result.map(e => {
    if (e.toString() == "Blob") {
      return {
        name: e.getName(),
        mimeType: e.getContentType(),
        data: `data:${e.getContentType()};base64,${Utilities.base64Encode(e.getBytes())}`,
      };
    }
    return e;
  });

  console.log(obj.result[0]);
}
