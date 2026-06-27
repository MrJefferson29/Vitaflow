<h1>Project Overview</h1>
The Smart Irrigation System is an IoT-based prototype designed for small-scale farming and agricultural demonstrations. It operates entirely over a Local Area Network (LAN), eliminating the need for paid cloud platforms. The system connects an ESP32 microcontroller, a local Node.js backend server, and an Expo mobile application on the same Wi-Fi network.

Core Architecture & Data Flow
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