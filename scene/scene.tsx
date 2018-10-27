import * as DCL from 'decentraland-api'
import * as io from 'socket.io-client'
import { CharacterManager } from 'lib/character-manager'
import { Character } from './lib/character'

const character = new Character()

const characterManager = new CharacterManager()

export interface IState {
  connected: boolean
  reconnects: number
}

export default class WebsocketScene extends DCL.ScriptableScene<any, IState> {
  public state: IState = {
    connected: false,
    reconnects: 0
  }

  // socket.io must uses CORS to connect across origins
  // preview server ➡️ http://127.0.0.1:8834
  // websocket server ➡️ http://127.0.0.1:8835
  private socket = io('http://127.0.0.1:8835', {
    // ⚠️ We set autoConnect to false because will connect manually at the end, after we set up all the events.
    autoConnect: false,
    // jsonp is impossible in this context (WebWorker)
    jsonp: false,
    // give up after failing too many times
    reconnectionAttempts: 30,
    // only use websockets, not polling
    transports: ['websocket']
  })

  public sceneDidMount() {
    const { socket } = this

    socket.on('connect', () => {
      this.setState({ connected: true })
      const { id, username, position, rotation } = character
      socket.emit('character-join', { id, username, position, rotation })
    })

    socket.on('disconnect', () => {
      console.error('socket.io disconnect')
      this.setState({ connected: false })
    })

    /**
     * As we did in the server, we’re handling all these errors so that we get feedback if they occur
     */
    socket.on('connect_error', (err: Error) =>
      console.error('socket.io connect_error', err)
    )
    socket.on('connect_timeout', (err: Error) =>
      console.error('socket.io connect_timeout', err)
    )
    socket.on('error', (err: Error) => console.error('socket.io error', err))
    socket.on('reconnect_attempt', () =>
      console.warn('socket.io reconnect_attempt')
    )
    socket.on('reconnecting', () => console.warn('socket.io reconnecting'))
    socket.on('reconnect_error', (err: Error) =>
      console.error('socket.io reconnect_error', err)
    )
    socket.on('reconnect_failed', (err: Error) =>
      console.error('socket.io reconnect_failed', err)
    )

    /**
     * We’re keeping track of how many times we’re connecting in the scene state
     */
    socket.on('reconnect', () => {
      let { reconnects } = this.state
      reconnects += 1
      this.setState({ reconnects })
    })

    // ⚠️ We connect manually, after all the events are set up
    socket.connect()

    socket.on('character-join', (evt: any) => {
      const [success, error] = characterManager.characterJoin(evt)
      console.log('character-join', evt, success, error)
      // How do you want to react to new characters joining?
    })

    socket.on('character-part', (evt: any) => {
      const [success, error] = characterManager.characterPart(evt)
      console.log('character-part', evt, success, error)
      // How do you want to react to characters leaving?
    })

    socket.on('character-position', (evt: any) => {
      const [success, error] = characterManager.updateCharacterPosition(evt)
      console.log('character-position', evt, success, error)
      // Do you want to react to character movements?
    })
    socket.on('character-rotation', (evt: any) => {
      const [success, error] = characterManager.updateCharacterRotation(evt)
      console.log('character-rotation', evt, success, error)
      // Do you want to react to where players are looking at?
    })

    // Tracking user movements (using W-A-S-D keys)
    //
    this.subscribeTo('positionChanged', (evt: any) => {
      const { id } = character
      const { position } = evt
      character.position = position
      socket.emit('character-position', { id, position })
      // update our tiles?
      // update our doors?
      // how do you want the scene to react to your own movement?
    })

    //
    // Tracking view rotation like mouse-look, phone, or VR view rotate.
    //
    this.subscribeTo('rotationChanged', (evt: any) => {
      const { id } = character
      const { rotation } = evt
      character.rotation = rotation
      socket.emit('character-rotation', { id, rotation })
      // how do you want the scene to react to your own rotation?
    })
  }

  public async render() {
    return (
      <scene>
        <sphere position={{ x: 5, y: 3, z: 5 }} />
      </scene>
    )
  }
}
