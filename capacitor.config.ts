import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.smartmail',
  appName: 'Smart Mail',
  webDir: 'dist',
  server: {
    // Works for physical devices (via adb reverse tcp:5173 tcp:5173) and dev servers:
    url: 'https://swift-template-send.lovable.app/dashboard',
    // Alternatively use your local Wi-Fi IP (e.g. 'http://192.168.0.143:5173'):
    // url: 'http://192.168.0.143:5173',
    cleartext: true
  }
};

export default config;
