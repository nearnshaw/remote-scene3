import * as cors from "cors";
import * as express from "express";
import * as http from "http";
import * as socketio from "socket.io";
import { CharacterManager } from "./lib/character-manager";


const characterManager = new CharacterManager();
const throttle = require("lodash/throttle");


//
// express allows us to use CORS easily
//
const expressApp: express.Application = express();

// we connect an http server to express because we need to be able
// to gracefully shut it down
const httpServer: http.Server = http.createServer(expressApp);

// socket.io
const socketServer: socketio.Server = socketio(httpServer, {
  // we don't need socketServer to serve the js client
  serveClient: false,
  // only use the websockets transport
  transports: ["websocket"],
});

// this allows the scene to speak to the server, even though they use different ports locally
expressApp.use(cors());

/**
 * Try to gracefully shut down the server, passing an exit code to the shell
 */
function shutdown(code: number = 0) {
    let exitCode: number = code;
  
    // stop socket.io
    try {
      socketServer.close();
    } catch (e) {
      console.error("error closing socket.io", e);
      exitCode = 1;
    }
  
    // stop node http server
    try {
      httpServer.close();
    } catch (e) {
      console.error("error closing http server", e);
      exitCode = 1;
    }
  
    // be a good CLI developer and give the correct exit code
    // 0 = everything worked fine
    // 1 = there was an error somewhere
    process.exit(exitCode);
  }
  
  //
  // handle other processes telling this one to shut down
  //
  process.on("SIGINT", () => shutdown());
  process.on("SIGTERM", () => shutdown());

  const port = 8835;

httpServer.listen(port, (err?: Error) => {
  if (err !== undefined && err !== null) {
    console.error("error binding http server", err);

    // use our graceful shutdown function
    return shutdown(1);
  }

  // let the user know its up
  console.log("http server listening", port)
});

socketServer.on("connect", (socket: socketio.Socket) => {
    let characterId: string | undefined;
  
    console.log("socket.io client connection", socket.id);
  
    socket.on("error", (err: Error) => {
      console.error("socket.io socket error", err);
    });
  
    /**
     * A new user joins -> send them everyone else's name and coordinates.
     */
    const introduceCharacters = throttle(() => {
      characterManager
        .characterList()
        // don't the user’s our own info
        .filter((item) => item.id !== characterId)
        // send everyone else's info
        .forEach((char) => {
          socket.emit("character-join", char);
        });
    }, 1000);
  
    /**
     * A user disconnects ->  remove their info from the CharacterManager hash table
     * Also, tell other users that they have disconnected.
     */
    socket.on("disconnect", () => {
      if (characterId !== undefined) {
        const partEvent = { id: characterId };
        characterManager.characterPart(partEvent);
        socketServer.emit("character-part", partEvent);
      }
    });
  
    /**
     * User joins the server -> remember their id and introduce
     * them to all the other users.
     */
    socket.on("character-join", (evt) => {
      const [success, error] = characterManager.characterJoin(evt);
  
      if (success === true) {
        console.log("character join", evt);
        const { id } = evt;
        characterId = id;
        socket.broadcast.emit("character-join", evt);
  
        // Share new user with everyone else
        introduceCharacters();
        return;
      }
  
      console.error("character join error", error, evt);
    });
  
    /**
     * User sends coordinates -> share this info with other users
     */
    socket.on("character-position", (evt) => {
      const [success, error] = characterManager.updateCharacterPosition(evt);
  
      if (success === true) {
        console.log("character position", evt);
        socket.broadcast.emit("character-position", evt);
        return;
      }
  
      console.error("character position error", error, evt);
    });
  
    /**
     * User sends rotation -> share this info with other users
     */
    socket.on("character-rotation", (evt) => {
      const [success, error] = characterManager.updateCharacterRotation(evt);
  
      if (success === true) {
        console.log("character rotation", evt);
        socket.broadcast.emit("character-rotation", evt);
        return;
      }
  
      console.error("character rotation error", error, evt);
    });
  
    /**
     * With regular pings we ensure users are still there. If they don't respond, their info
     * is discarded.
     */
    socket.on("character-ping", (evt: any) => {
      const [success, error] = characterManager.ping(evt);
  
      if (success === true) {
        console.log("character ping", evt);
        return;
      }
  
      console.error("character ping error", error, evt);
    });
  
    /**
     * A user can ask to be introduced again in case of a problem
     */
    socket.on("introduce", () => introduceCharacters());
  });
  