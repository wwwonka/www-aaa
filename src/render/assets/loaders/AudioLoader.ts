import { registerLoader } from '../registry'
import type { IResourceLoader } from '../types'

// Locally created AudioContext, no centralized sharing for now — YAGNI, revisit if a centralized
// mixing need appears (volume bus, etc.).
let audioContext: AudioContext | undefined

/** Decodes audio formats into a ready `AudioBuffer`. */
const audioLoader: IResourceLoader<AudioBuffer> = {
  async parse(blob) {
    audioContext ??= new AudioContext()
    return audioContext.decodeAudioData(await blob.arrayBuffer())
  },
}

registerLoader(['mp3', 'ogg', 'wav'], audioLoader)
