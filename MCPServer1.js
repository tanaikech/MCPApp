/**
 * This function gets messages from Gmail.
 */
function get_massages_from_Gmail(args = {}) {
  let { after, excludedMessageIds = [] } = args;
  try {
    if (!after) {
      /**
       * When no 'after' time is set, emails from 30 minutes ago to the present are retrieved.
       */
      after = Math.floor((Date.now() / 1000) - (30 * 60));
    } else {
      after = Math.floor(new Date(after) / 1000);
    }

    const labels = GmailApp.getUserLabels().map(l => l.getName());
    const threads = GmailApp.search(`after:${after}`);
    const messages = threads.reduce((ar, t) => {
      const messages = t.getMessages().reduce((arr, m) => {
        const mId = m.getId();
        if (!excludedMessageIds.includes(mId)) {
          arr.push({
            title: m.getSubject(),
            from: m.getFrom(),
            body: m.getPlainBody().trim(),
            messageId: mId,
          });
        }
        return arr;
      }, []);
      if (messages.length > 0) {
        ar.push({ threadId: t.getId(), messages });
      }
      return ar;
    }, []);
    const countMessages = messages.reduce((c, e) => c += e.messages.length, 0);
    let messagesStr, jsonSchemaStr;
    if (messages.length > 0) {
      const jsonSchema = {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "threadId": {
              "type": "string",
              "description": "The unique identifier for the email thread."
            },
            "messages": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "title": {
                    "type": "string",
                    "description": "The email address of the sender of the email message."
                  },
                  "from": {
                    "type": "string",
                    "description": "The title or subject of the email message."
                  },
                  "body": {
                    "type": "string",
                    "description": "The main content or body of the email message."
                  },
                  "messageId": {
                    "type": "string",
                    "description": "The unique identifier for the individual email message."
                  }
                },
                "required": ["title", "body", "messageId"]
              }
            }
          },
          "required": ["threadId", "messages"]
        }
      };
      messagesStr = [
        `${countMessages} new messages were found.`,
        `The messages from Gmail are put in "Data" of a JSON array.`,
        `<Data>${JSON.stringify(messages)}</Data>`,
        `The user's labels are as follows.`,
        `<Labels>${labels.join(",")}</Label>`
      ];
      jsonSchemaStr = [
        `The JSON schema of "Data" is as follows. Understand "Data" using this JSON schema.`,
        `<JSONSchema>${JSON.stringify(jsonSchema)}</JSONSchema>`,
      ];
    } else {
      messagesStr = ["New messages were not found."];
      jsonSchemaStr = [];
    }
    const text = [...messagesStr, ...jsonSchemaStr].join("\n");
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
 * This function adds labels to threads.
 */
function add_label_to_Gmail(args = {}) {
  const { obj } = args;
  try {
    const labelObj = GmailApp.getUserLabels().reduce((o, l) => (o[l.getName()] = l, o), {});
    const res = obj.reduce((ar, e) => {
      if (e.threadId && e.labels && e.labels.length > 0) {
        ar.push(`The labels of "${e.labels.join("\n")}" were added to the thread of ${e.threadId}.`);
        try {
          const thread = GmailApp.getThreadById(e.threadId);
          e.labels.forEach(l => {
            if (labelObj[l]) {
              thread.addLabel(labelObj[l]);
            }
          });
        } catch ({ stack }) {
          console.error(stack);
        }
      }
      return ar;
    }, []);
    if (res.length > 0) {
      console.log(res); // Check response.
      return {
        jsonrpc: "2.0",
        result: { content: [{ type: "text", text: res.join("\n") }], isError: false }
      };
    } else {
      return {
        jsonrpc: "2.0",
        result: { content: [{ type: "text", text: "No labels were added to any threads." }], isError: false }
      };
    }
  } catch (err) {
    console.log(err.stack);
    return {
      jsonrpc: "2.0",
      result: { content: [{ type: "text", text: err.message }], isError: true }
    };
  }
}

/**
 * This function automatically drafts emails in Gmail.
 */
function auto_draft_creation_Gmail(args = {}) {
  const { obj } = args;
  try {
    if (obj && obj.length > 0) {
      const res = obj.reduce((ar, e) => {
        if (e.messageId && e.replyMessage) {
          try {
            const m = GmailApp.getMessageById(e.messageId);
            m.createDraftReply(e.replyMessage);
            const searchUrl = `https://mail.google.com/mail/#search/rfc822msgid:${encodeURIComponent(m.getHeader("Message-ID"))}`;
            ar.push(`Created a drafted email to the message ID of "${e.messageId}". The URL is "${searchUrl}".`);
          } catch ({ stack }) {
            console.error(stack);
          }
        }
        return ar;
      }, []);
      if (res.length > 0) {
        console.log(res); // Check response.
        return {
          jsonrpc: "2.0",
          result: { content: [{ type: "text", text: res.join("\n") }], isError: false }
        };
      } else {
        return {
          jsonrpc: "2.0",
          result: { content: [{ type: "text", text: "No creation of drafted emails." }], isError: false }
        };
      }
    } else {
      return {
        jsonrpc: "2.0",
        result: { content: [{ type: "text", text: "No creation of drafted emails." }], isError: false }
      };
    }
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
      "serverInfo": { "name": "MCP server for managing Gmail by MCPApp", "version": "1.0.0" }
    }
  },
  {
    "type": "tools/list",
    "function": get_massages_from_Gmail,
    "value": {
      name: "get_massages_from_Gmail", // <--- It is required to create a function of the same name as this.
      description: "Get messages (emails) from Gmail.",
      inputSchema: {
        type: "object",
        properties: {
          after: {
            description: `Time for retrieving the emails. The emails are retrieved from "after" to now. The date format is "yyyy-MM-dd\'T\'HH:mm:ss".`,
            type: "string"
          },
          excludedMessageIds: {
            description: `Excluded message IDs.`,
            type: "array",
            items: { type: "string", description: `Excluded message ID.` }
          }
        },
        required: ["after"]
      }
    }
  },
  {
    "type": "tools/list",
    "function": add_label_to_Gmail,
    "value": {
      name: "add_label_to_Gmail", // <--- It is required to create a function of the same name as this.
      description: "Add labels to threads of Gmail. Don't use the invalid thread IDs.",
      inputSchema: {
        type: "object",
        properties: {
          obj: {
            type: "array",
            description: `Object array including thread IDs and labels. The labels are added to each thread IDs.`,
            items: {
              type: "object",
              description: "Thread IDs and labels. The labels are added to each thread IDs.",
              properties: {
                threadId: {
                  type: "string",
                  description: "The unique identifier for the email thread.",
                },
                labels: {
                  type: "array",
                  description: "Array including the labels.",
                  items: {
                    type: "string",
                    description: "The suitable labels for the thread of the thread ID.",
                  }
                }
              },
              required: ["threadId", "labels"]
            }
          }
        },
        required: ["obj"]
      }
    }
  },
  {
    "type": "tools/list",
    "function": auto_draft_creation_Gmail,
    "value": {
      name: "auto_draft_creation_Gmail", // <--- It is required to create a function of the same name as this.
      description: "Create automatically drafted emails in Gmail. Don't use the invalid message IDs.",
      inputSchema: {
        type: "object",
        properties: {
          obj: {
            type: "array",
            description: `Object array including message IDs and reply messages. Each reply message is used as a reply to each message with the message ID.`,
            items: {
              type: "object",
              description: "Message IDs and reply messages. Each reply message is used as a reply to each message with the message ID.",
              properties: {
                messageId: {
                  type: "string",
                  description: "The unique identifier for the email message.",
                },
                replyMessage: {
                  type: "string",
                  description: "Message for replying to the mail.",
                }
              },
              required: ["messageId", "replyMessage"]
            }
          }
        },
        required: ["obj"]
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
