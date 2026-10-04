# MASTER PROMPT: BLUETOOTH GROUP CHAT (NEXT.JS)

## 1. ROLE
You are a senior full-stack engineer. You build a chat application.
Users send messages and files to each other with Bluetooth Low Energy (BLE).
The application does not use the internet. The application does not use a server.

## 2. TERMS
Use these terms in all code, comments, and UI text. Do not use other names for them.
- Group: a chat room that one Host creates.
- Host: the device that creates the Group. The Host is the BLE peripheral.
- Member: a device that joins a Group. A Member is a BLE central.
- Frame: one logical message that the application defines.
- Packet: one BLE write or one BLE notification. A Frame can use many Packets.
- Transport: the code layer that sends and receives Frames.

## 3. PLATFORM LIMITS
- Web Bluetooth lets a web page act only as a BLE central.
  A web page cannot advertise. A web page cannot be a BLE peripheral.
- Web Bluetooth works only in Chromium browsers on desktop and Android.
  It does not work on iOS or in Firefox.
- Web Bluetooth needs HTTPS or localhost. It needs a user tap before each scan.
- In a browser, the browser shows the device chooser.
  The application cannot show its own list in a browser.

Because of these limits, build two layers:
1. A Next.js web application. It contains all UI and all protocol logic.
2. A Capacitor shell around the exported Next.js application.
   The shell gives native BLE peripheral and central access to the web code.

## 4. USER FLOW
Screen 1, Home.
- Show two buttons: "Create group" and "Join group".

Screen 2a, Create group.
- The user enters a group name (1 to 24 characters).
- The user enters a display name (1 to 20 characters).
- The user taps "Create". The device starts to advertise the Group.
- Go to Screen 4.

Screen 2b, Join group.
- The device scans for Groups. Show the Groups in range as a list.
- Each item shows the group name and the signal strength.
- Add a "Rescan" button. Show an empty state when no Group is found.
- The user taps one Group. Go to Screen 3.

Screen 3, Display name.
- The user enters a display name (1 to 20 characters).
- The user taps "Join". The Member connects and sends a JOIN Frame.
- Go to Screen 4.

Screen 4, Chat.
- Show the message list, a text input, a "Send" button, and an "Attach file" button.
- Show the member count and a "Leave" button.
- The Host also sees a "Close group" button.

## 5. ARCHITECTURE
- Use a hub-and-spoke design. All Members connect to the Host.
  The Host sends each message to all other Members.
- Define a `Transport` interface in TypeScript with these methods:
  `startAdvertising(group)`, `stopAdvertising()`, `scan(onFound)`,
  `connect(groupId)`, `send(frame)`, `onFrame(callback)`, `disconnect()`.
- Write three implementations:
  1. `MockTransport`. It uses BroadcastChannel. Two browser tabs act as two devices.
     Use it for development and tests.
  2. `WebBluetoothTransport`. Member role only. It uses `navigator.bluetooth`.
  3. `NativeBleTransport`. Host role and Member role. It calls a Capacitor plugin.
- UI code must not import a Transport implementation directly.
  Select the Transport with a factory function.

## 6. BLE PROTOCOL
- Use one GATT service with a custom UUID.
  Generate the UUIDs. Put them in `src/lib/ble/constants.ts`.
- Use three characteristics:
  - GROUP_INFO (read): JSON with groupId, groupName, and memberCount.
  - RX (write without response): a Member writes Packets to the Host.
  - TX (notify): the Host sends Packets to Members.
- The advertisement contains the service UUID.
  The group name can be too long for the advertisement.
  After a Member connects, it reads the full group name from GROUP_INFO.
- Each Packet starts with a binary header:
  type (1 byte), messageId (2 bytes), sequence (2 bytes), total (2 bytes).
  The payload follows the header.
- Frame types: JOIN, JOIN_ACK, MEMBER_LIST, TEXT, FILE_OFFER, FILE_ACCEPT,
  FILE_CHUNK, FILE_DONE, LEAVE, CLOSE.
- Control Frames use UTF-8 JSON. FILE_CHUNK uses raw bytes.
- The Packet size is the negotiated MTU minus 3 bytes.
  If the MTU is not known, use 20 bytes of payload.
- The receiver joins all Packets with the same messageId to make the Frame.

## 7. FILE TRANSFER
1. The sender sends FILE_OFFER. It contains fileId, name, size, MIME type, and SHA-256 hash.
2. The receiver taps "Accept". The receiver sends FILE_ACCEPT.
3. The sender sends FILE_CHUNK Frames in order.
   Wait until the Transport is ready before each write. Do not flood the BLE buffer.
4. Show a progress bar on both devices. Add a "Cancel" button.
5. When all chunks arrive, the receiver calculates the SHA-256 hash with `crypto.subtle`.
   If the hash does not match, show an error.
   If the hash matches, show a "Download" button.
- The default maximum file size is 5 MB. Put it in a constant.
- BLE is slow. Show the estimated transfer time before the sender confirms.
- Keep received files in memory as Blob objects only.

## 8. STACK
- Next.js (App Router), TypeScript in strict mode, Tailwind CSS.
- Zustand for state. Vitest for unit tests.
- Set `output: 'export'` in `next.config`. Capacitor loads the exported files.
- Each component that uses `navigator.bluetooth` or Capacitor must be a Client Component.
- Check for Bluetooth support at run time.
  If Bluetooth is not available, show a clear message that gives the reason.

## 9. FILE STRUCTURE
- `src/app/`: screens
- `src/components/`: UI components
- `src/lib/ble/`: constants, frame encoder and decoder, Transport implementations
- `src/lib/files/`: file transfer logic
- `src/store/`: Zustand stores
- `native/`: Capacitor plugin (Android in Kotlin, iOS in Swift)

## 10. BUILD ORDER
Do the phases in order. Stop after each phase.
Tell me what you built and how to run it.
- Phase 1: Project setup. All screens. Use `MockTransport`.
- Phase 2: Frame encoder and decoder. Write unit tests for splitting and rebuilding.
- Phase 3: Text chat for Host and Member over `MockTransport`. Test with two tabs.
- Phase 4: File transfer over `MockTransport`. Include the hash check and progress.
- Phase 5: `WebBluetoothTransport` (Member role).
- Phase 6: Capacitor shell and native plugin. Include advertising, scan, connect, notify, and MTU.
- Phase 7: Error handling. Cover disconnect, Host leaves, Bluetooth off, and permission denied.

## 11. RULES FOR YOU
- Do not ask me questions. If information is missing, make an assumption.
  Write all assumptions in a list at the end of your answer.
- Do not write code that pretends to work.
  If a part is not done, throw an error that says "NOT IMPLEMENTED" and names the part.
- Do not guess a package name. If you are not sure that a package exists,
  write the code yourself and tell me.
- Write complete files. Do not use "..." in code.
- After each phase, run the type check, the linter, and the tests. Report the results.
- Keep each function short.
  Add a comment only when the reason for the code is not clear.

## 12. OUT OF SCOPE
- Encryption (other than BLE pairing), user accounts, voice, video.
- Message history after the Group closes.
- More than 6 Members. Many phones limit the number of BLE connections.
  Put the limit in a constant.

## 13. DONE WHEN
1. Phone A creates a Group.
2. Phone B scans and sees the Group.
3. Phone B joins and enters a name.
4. Phone A and phone B exchange text messages.
5. Phone B sends a 1 MB file. Phone A downloads it. The hash matches.