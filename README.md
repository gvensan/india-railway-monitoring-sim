# 🚂 Train Monitoring System

A comprehensive real-time train monitoring and simulation system for Indian Railways, featuring interactive maps, multi-train tracking, alert management, and event monitoring capabilities.

## ⚠️ DISCLAIMER

This is a **simulation system** for demonstration purposes only. It does not use real-time data or connect to actual railway systems. All train information, schedules, and movements are simulated using sample data. For real train information, please refer to official Indian Railways sources.

## 🎯 What is this?

This is a web-based train monitoring system that simulates real Indian Railways operations. You can:
- **Monitor trains** moving across India in real-time
- **Manage alerts** for train issues like breakdowns or AC problems  
- **Track events** as trains move between stations
- **Explore the system** with an interactive guided tour

Perfect for railway enthusiasts, developers, or anyone interested in train operations!

### 🆕 What's New

- **🎯 Interactive Tour**: Take a guided walkthrough to learn all features
- **⚠️ Smart Alerts**: Complete alert lifecycle from raised to served/missed
- **🔄 Dual Messaging**: Solace PubSub+ with automatic fallback
- **📱 Better Mobile**: Improved responsive design
- **🚂 300+ Trains**: Real Indian Railways data

## 🚀 How to Run

### Option 1: Simple (Just open the file)
1. Download the project
2. Open `index.html` in your web browser
3. That's it! 🎉

### Option 2: Local Server (Recommended)
```bash
# Navigate to the project folder
cd india-railway-monitoring-sim

# Start a simple server
python -m http.server 8000
# OR
npx serve .

# Open http://localhost:8000 in your browser
```

**Requirements**: Just a modern web browser and internet connection!

## 🎮 How to Use

### First Time? Take the Tour!
Click the **🎯 tour button** in the map's zoom controls (between + and -) for a guided walkthrough of all features.

### Main Areas
1. **🗺️ Map** - Central view showing trains and stations
2. **🚂 Control Panel** - Right sidebar with train controls and info
3. **📋 Events Panel** - Left sidebar showing real-time events  
4. **⚠️ Alert Panel** - Bottom panel for managing alerts

### Quick Controls
- **🚂 Train Button** (top-right) - Open/close control panel
- **📋 Events Button** (bottom-left) - Open/close events panel
- **⚠️ Alert Button** (bottom-right) - Open/close alerts panel

## 🎛️ Basic Controls

### Start Monitoring
1. **Select a Train** - Choose from 300+ real Indian Railways trains
2. **Click Load** - Initialize the selected train
3. **Click Play** - Start the simulation
4. **Watch it Go!** - Train moves along its real route

### Control Buttons
- **▶️ Play** - Start simulation
- **⏸️ Pause** - Pause simulation  
- **⏹️ Stop** - Reset to start
- **🎚️ Speed** - Adjust from 1x to 10x speed

### Quick Actions
- **🚂 Toggle Railway Map** - Show/hide railway tracks
- **🎯 Center on Train** - Follow the train
- **🔄 Reset** - Start over

## ⚠️ Managing Alerts

### What are Alerts?
Alerts represent issues that need attention on trains:
- **💧 Water Tank** - Water service needed
- **🔧 Breakdown** - Mechanical issues  
- **❄️ AC Malfunction** - Air conditioning problems
- **🚨 Emergency** - Critical safety issues

### How to Raise Alerts
1. **Open Alert Panel** - Click the ⚠️ button
2. **Click Train Icon** - Select which train has the issue
3. **Choose Alert Type** - Pick the appropriate alert
4. **Watch the Flag** - Alert appears on map at next station

### Alert Lifecycle
- **Raised** - Alert is created and visible on map
- **Served** - Issue is resolved
- **Missed** - Train left station without service
- **Unserved** - Alert remains when train reaches destination

## 📋 Event Monitoring

### What are Events?
Events show what's happening in real-time:
- **🚂 Train Events** - Departures, arrivals, speed changes
- **🚉 Station Events** - Platform assignments, delays
- **⚠️ Alert Events** - Alerts raised, served, missed

### How to View Events
1. **Open Events Panel** - Click the 📋 button
2. **Filter Events** - Use buttons to show specific event types
3. **Watch Live Updates** - Events appear as they happen
4. **Clear Events** - Remove old events to focus on new ones

## 🔍 Troubleshooting

### Common Issues

**Map not loading?**
- Check your internet connection
- Try refreshing the page

**Train not moving?**
- Make sure you clicked "Play" ▶️
- Check that a train is selected and loaded

**Events not showing?**
- Click the 📋 Events button to open the panel
- Check the connection status at the top of the page

**Need help?**
- Take the interactive tour (🎯 button in map controls)
- Check the About dialog (ℹ️ button in header)

## 🎉 That's It!

You're now ready to explore the Train Monitoring System! 

**Quick Start Checklist:**
1. ✅ Open the application
2. ✅ Take the interactive tour (🎯 button)
3. ✅ Select a train and start monitoring
4. ✅ Try raising some alerts
5. ✅ Watch the events in real-time

**Need more details?** Check the About dialog (ℹ️ button) for technical information and system status.

**Happy monitoring!** 🚂✨
