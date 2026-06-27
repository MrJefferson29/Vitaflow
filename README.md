<h1>Project Overview</h1>
The Smart Irrigation System is an IoT-based prototype designed for small-scale farming and agricultural demonstrations. It operates entirely over a Local Area Network (LAN), eliminating the need for paid cloud platforms. The system connects an ESP32 microcontroller, a local Node.js backend server, and an Expo mobile application on the same Wi-Fi network.

<h4>Core Architecture & Data Flow</h4>
The system is divided into three distinct layers:

Hardware Layer (ESP32): Reads raw analog data from a capacitive soil moisture sensor on GPIO34 (12-bit ADC, where higher values indicate drier soil) and controls a water pump relay on GPIO26. It pushes sensor data to the server every 1.5 seconds and pulls pump status updates every 400 ms.

Backend Layer (Node.js & Express 5): Acts as the central "source of truth." It hosts a REST API on port 5000, processes raw sensor values into a readable moisture percentage (0% to 100%), handles pump toggles, and manages local data storage using a lightweight JSON file (store.json). It also features optional OpenAI integration for agronomy advice.

Application Layer (Expo / React Native): A cross-platform mobile app that features a live monitoring dashboard (moisture % and pump status), a farm task reminder scheduler, and an AI-powered agronomy chat assistant.

Key Features & Technologies
Real-time Monitoring & Control: Live data syncing paired with manual/remote pump triggers via the mobile app.

Local Data Persistence: Avoids heavy database setups by using atomic-style writes directly to a local JSON file.

Security: Authenticates hardware data uploads via a shared API key (x-device-key).

AI Integration: Leverages the OpenAI API (gpt-4.1-mini) to provide crop care and irrigation guidance, with a hardcoded fallback text system if offline.

Future-Ready: Includes pre-installed dependencies (like mongoose and jsonwebtoken) to allow for seamless future upgrades to cloud databases and user authentication.

<p align="center">
<img width="250" height="650" alt="Image" src="https://github.com/user-attachments/assets/db3e2355-0107-427e-9bae-89fb57e38a10" />
<img width="250" height="650" alt="Image" src="https://github.com/user-attachments/assets/1da120e9-680f-435e-a14f-24f68b638ad5" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/c045a250-3c29-41f4-ab77-c653d33e3410" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/9706fe57-5cd2-4c0d-9600-81fb177208f3" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/4608fd8b-7a1d-4f0d-b7b3-28b190b6869b" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/a99fca02-2ea0-44f1-b98e-86e85190e569" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/e0e13a2e-8e4c-460b-8d36-e79589f3a0b2" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/c25feb09-a829-4667-9bb7-7ffd2f8e1b23" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/c008a203-fed2-49ae-9a49-a1152199b740" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/4405d9b0-899c-4514-90d3-d66059eed946" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/d502efb8-32ee-443d-808a-1c7720375730" />
<img width="255" height="650" alt="Image" src="https://github.com/user-attachments/assets/7e93b8ec-4047-49c3-ac37-566d1a21417e" />
</p>