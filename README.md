# MCPApp

<a name="top"></a>
[![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENCE)

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/tanaikech-mcpapp-badge.png)](https://mseep.ai/app/tanaikech-mcpapp)

<a name="overview"></a>

# Overview

The **Model Context Protocol (MCP)** is an emerging standard designed to function as a universal adapter, enabling AI applications to seamlessly and securely connect with external systems and data sources. The core purpose of MCP is to provide a standardized method for AI models to request and receive contextually relevant information, which is crucial for performing complex tasks.

This repository introduces two directions:

1.  [An **MCP server** built with Google Apps Script for Gemini CLI and other MCP clients.](simpleMCPserver.md)
2.  [An **MCP network** built with Google Apps Script.](buildMCPNetwork.md)

---

<a name="licence"></a>

# Licence

[MIT](LICENCE)

<a name="author"></a>

# Author

[Tanaike](https://tanaikech.github.io/about/)

[Donate](https://tanaikech.github.io/donate/)

<a name="updatehistory"></a>

# Update History

- v1.0.0 (May 8, 2025)

  1. Initial release.

- v1.0.1 (May 9, 2025)

  1. A bug in the logging was removed.

- v1.0.2 (May 29, 2025)

  1. From v1.0.2, in order to use MCPApp as a library, LockService is given.

- v2.0.0 (June 12, 2025)

  1. From v2.0.0, both the MCP client and the MCP server can be built by Google Apps Script.

- v2.0.1 (June 18, 2025)

  1. A bug was removed.

- v2.0.2 (June 19, 2025)

  1. A bug was removed.

- v2.0.3 (July 1, 2025)

  1. A bug was removed.

- v2.0.4 (July 2, 2025)

  1. A bug was removed.

- v2.0.5 (July 31, 2025)

  1. A bug was removed.

- v2.0.6 (August 1, 2025)

  1. "prompts/get" method was updated.

- v2.0.7 (August 6, 2025)

  1. Starting with v2.0.7, you can now selectively enable or disable the **LockService**.
    - By default, this library runs with the LockService enabled. To disable it, simply modify `return new MCPApp.mcpApp({ accessKey: "sample" })` to `return new MCPApp.mcpApp({ accessKey: "sample", lock: false })`.
    - When the LockService is disabled (`lock: false`), asynchronous requests from clients like the Gemini CLI may see an increase in processing speed. However, it's important to note that the maximum number of concurrent requests must not exceed 30. Please use this option with caution.

- v2.0.8 (August 6, 2025)

  1. A bug was removed.

[TOP](#top)
