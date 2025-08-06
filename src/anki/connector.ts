// // src/anki/connector.ts
// import axios from 'axios';
// import { ANKI_CONNECT_URL } from '../config/anki.js';

// /**
//  * A centralized function to send requests to the AnkiConnect API.
//  * It handles the boilerplate for the request structure and error checking.
//  * @param action The AnkiConnect action to perform (e.g., 'notesInfo').
//  * @param params The parameters for the action.
//  * @returns The 'result' from the AnkiConnect response.
//  */
// export async function ankiConnectRequest(action: string, params = {}) {
//   try {
//     const response = await axios.post(ANKI_CONNECT_URL, {
//       action,
//       version: 6,
//       params,
//     });
    
//     if (response.data.error) {
//       // AnkiConnect itself returned an error (e.g., note not found)
//       throw new Error(`AnkiConnect API Error: ${response.data.error}`);
//     }
    
//     return response.data.result;

//   } catch (error) {
//     if (axios.isAxiosError(error) && (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET')) {
//       // Network-level error
//       throw new Error(
//         'Connection to AnkiConnect failed. Is Anki running with the AnkiConnect addon installed and enabled?',
//       );
//     }
//     // Re-throw other errors (like the API error above) to be handled by the command
//     throw error;
//   }
// }


// src/anki/connector.ts
import axios from 'axios';
import { ANKI_CONNECT_URL } from '../config/anki.js';
import { ANKI_CONNECT_DELAY_MS } from '../config/app.js';
import { delay } from '../utils/timers.js';

/**
 * A centralized function to send requests to the AnkiConnect API.
 * It handles the boilerplate for the request structure and error checking.
 * @param action The AnkiConnect action to perform (e.g., 'notesInfo').
 * @param params The parameters for the action.
 * @returns The 'result' from the AnkiConnect response.
 */
export async function ankiConnectRequest(action: string, params = {}) {
  try {
    const response = await axios.post(ANKI_CONNECT_URL, {
      action,
      version: 6,
      params,
    });

    if (response.data.error) {
      // AnkiConnect itself returned an error (e.g., note not found)
      throw new Error(`AnkiConnect API Error: ${response.data.error}`);
    }

    return response.data.result;
  } catch (error) {
    if (axios.isAxiosError(error) && (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET')) {
      // Network-level error
      throw new Error(
        'Connection to AnkiConnect failed. Is Anki running with the AnkiConnect addon installed and enabled?',
      );
    }
    // Re-throw other errors (like the API error above) to be handled by the command
    throw error;
  }
}

/**
 * A centralized, delay-wrapped wrapper for AnkiConnect requests.
 * All commands should use this to ensure consistent timing.
 * @param action The AnkiConnect action to perform.
 * @param params The parameters for the action.
 * @returns The 'result' from the AnkiConnect response.
 */
export async function delayedAnkiRequest<T>(action: string, params: object = {}): Promise<T> {
  await delay(ANKI_CONNECT_DELAY_MS);
  return ankiConnectRequest(action, params);
}