# CPSC 3750 Final Project - Full-Stack Battleship (Phase 2)

## Team S. S. GPT
+ Anthony Frialde
+ Christian Johnston

## Project Overview
A distributed networking client and server suite designed for synchronized multiplayer Battleship. This phase focuses on a robust frontend client capable of interfacing with remote REST API servers, managing real-time game states, and handling multi-server connectivity with strict user validation.

## Architecture
* **Client Interface:** JavaScript, HTML5, and CSS3 hosted on Cloudflare Pages.
* **API Backend:** Node.js and Express hosted on Render.com.
* **Database:** Relational PostgreSQL architecture hosted on Render.com.

## API Specification

### GET
* `/api/players`: Retrieve Player Statistics
* `/api/games`: Retrieve Game State
* `/api/games/[id]/moves`: Retrieve Move History
* `/api/health`: System health check

### POST
* `/api/reset`: Reset system state (Truncate all tables)
* `/api/players`: Create Player
* `/api/games`: Create New Game
* `/api/games/[id]/join`: Join Existing Game
* `/api/games/[id]/ships`: Place Ships
* `/api/games/[id]/moves`: Fire Shot at Opponent

### PUT
+ N/A

### DELETE
+ N/A

### Test Mode Operations
* `RESTART IDENTITY`: Reset serial IDs during truncation.
* `Deterministic Placement`: Support for automated grading and testing sequences.

## AI Tools
+ Chat GPT
+ Gemini

## Responsibilities

### Team Responsiblities
+ Full-Stack Integration: Collaborated on the end-to-end integration of the REST API with the frontend client to ensure seamless data flow and real-time state synchronization.
+ Agile Development: Utilized iterative development cycles and AI-assisted pair programming to rapidly prototype features and resolve architectural bottlenecks.
+ System Security: Enforced shared security standards across the stack, including input sanitization and secure communication protocols between the client and server.
+ Core Game Engine: Developed and maintained the authoritative server-side logic, including coordinate validation, hit/miss calculations, and automated win-condition detection.

### Anthony Frialde
+ Distributed Networking: Architected the protocols required to establish and maintain stable connections with external, third-party API environments.
+ Visual Interface Design: Lead the aesthetic and UI/UX design of the game client, focusing on responsive board interactions and a cohesive tactical theme.
+ API Performance: Optimized backend route handling in Node.js/Express to minimize latency during high-concurrency game sessions.
+ State Synchronization Architecture: Engineered the client-side state management logic to handle asynchronous API responses, ensuring the UI accurately reflects the server."

### Christian Johnston
+ System Architecture: Engineered the core client-side framework and hierarchical site-map to ensure a streamlined user experience.
+ Database & Security: Designed the relational PostgreSQL schema and implemented robust user validation layers to secure player registration and session integrity.
+ Technical Product Management: Directed the project lifecycle by maintaining technical documentation and enforcing strict adherence to API contracts to prevent feature creep.
+ Quality Assurance: Developed a deterministic testing strategy to identify and resolve edge-case bugs in server-side state persistence and API responses.

### AI
+ Writing boilerplate code
+ Evaluating and providing suggestions on human work
+ Creating test suites for tests designed by us
