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
* Method for the MCP server.
*
* @param {Object} object Object using this script.
* @param {Object} object.eventObject Event object from doPost function.
* @param {Object} object.serverResponse Object for the server response.
* @param {Object} object.functions Functions for using at tools/call.
* @return {ContentService.TextOutput}
*/
function server(object) {
  return this.mcpApp.server(object);
}
