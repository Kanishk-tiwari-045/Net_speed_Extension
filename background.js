// Simplified Background service worker for speed-based 5G/4G detection
class NetworkDownloadManager {
  constructor() {
    this.isMonitoring = false;
    this.currentNetworkType = 'unknown';
    this.pausedDownloads = new Set();
    
    // **SIMPLIFIED: Only 0.7 Mbps threshold for 5G/4G detection**
    this.speedThreshold = 0.7; // Above 0.7 Mbps = 5G, below = 4G
    this.isEnabled = true;
    
    this.initializeExtension();
  }

  async initializeExtension() {
    console.log('🚀 Initializing Smart Download Manager (Speed-based)...');
    
    const settings = await chrome.storage.local.get(['isEnabled', 'speedThreshold']);
    
    this.isEnabled = settings.isEnabled !== false;
    this.speedThreshold = settings.speedThreshold || 0.7;
    
    this.setupEventListeners();
    
    if (this.isEnabled) {
      this.startNetworkMonitoring();
    }
    
    console.log('✅ Extension initialized', {
      enabled: this.isEnabled,
      threshold: this.speedThreshold
    });
  }

  setupEventListeners() {
    chrome.downloads.onCreated.addListener((downloadItem) => {
      this.handleNewDownload(downloadItem);
    });

    chrome.downloads.onChanged.addListener((delta) => {
      this.handleDownloadChange(delta);
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📨 Received message:', message.action);
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  async startNetworkMonitoring() {
    this.isMonitoring = true;
    console.log('📡 Starting speed-based network monitoring...');
    
    await this.checkNetworkSpeed();
    this.startSpeedMonitoring();
  }

  startSpeedMonitoring() {
    const monitor = async () => {
      if (!this.isMonitoring) return;
      
      try {
        await this.checkNetworkSpeed();
      } catch (error) {
        console.error('Speed monitoring error:', error);
      }
      
      // Check every 5 seconds for speed changes
      setTimeout(monitor, 5000);
    };
    
    monitor();
  }

  stopNetworkMonitoring() {
    this.isMonitoring = false;
    console.log('🛑 Speed monitoring stopped');
  }

  async checkNetworkSpeed() {
    try {
      console.log('🌐 Checking network speed with threshold:', this.speedThreshold);
      
      const networkInfo = await this.getNetworkInformation();
      const detectedType = this.analyzeNetworkSpeed(networkInfo);
      
      if (detectedType !== this.currentNetworkType) {
        console.log(`🔄 Speed-based change detected: ${this.currentNetworkType} -> ${detectedType}`);
        await this.handleNetworkChange(this.currentNetworkType, detectedType);
        this.currentNetworkType = detectedType;
      }
      
    } catch (error) {
      console.error('Error checking network speed:', error);
    }
  }

  async getNetworkInformation() {
    const info = {
      timestamp: Date.now(),
      effectiveType: 'unknown',
      downlink: 0,
      rtt: 0
    };

    // Get browser network information
    if ('connection' in navigator && navigator.connection) {
      const conn = navigator.connection;
      info.effectiveType = conn.effectiveType || 'unknown';
      info.downlink = conn.downlink || 0;
      info.rtt = conn.rtt || 0;
      console.log('📊 Browser Network API:', {
        effectiveType: info.effectiveType,
        downlink: info.downlink,
        rtt: info.rtt
      });
    }

    // Perform actual speed test
    const speedTest = await this.performSpeedTest();
    info.measuredSpeed = speedTest.speed;
    info.measuredLatency = speedTest.latency;
    info.testSuccess = speedTest.success;

    return info;
  }

  async performSpeedTest() {
    const startTime = performance.now();
    
    try {
      // Use 128KB test for faster, more frequent checks
      const testSize = 131072; // 128KB
      const response = await fetch(`https://httpbin.org/bytes/${testSize}`, {
        cache: 'no-cache',
        signal: AbortSignal.timeout(8000)
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (response.ok) {
        const data = await response.arrayBuffer();
        const speed = (data.byteLength * 8) / (duration / 1000) / 1000000; // Mbps
        
        return { 
          speed: speed, 
          latency: duration,
          success: true 
        };
      }
    } catch (error) {
      console.log('Speed test failed:', error.message);
    }
    
    return { speed: 0, latency: 999, success: false };
  }

  analyzeNetworkSpeed(networkInfo) {
    const { measuredSpeed, testSuccess, downlink } = networkInfo;
    
    let speed = 0;
    
    // Prioritize measured speed over browser API
    if (testSuccess && typeof measuredSpeed === 'number' && measuredSpeed > 0) {
      speed = measuredSpeed;
      console.log(`📊 Using measured speed: ${speed.toFixed(3)} Mbps`);
    } else if (typeof downlink === 'number' && downlink > 0) {
      speed = downlink;
      console.log(`📊 Using browser API downlink: ${speed.toFixed(3)} Mbps`);
    } else {
      console.log('📊 No valid speed data, defaulting to 4G');
      return '4g';
    }
    
    // **SIMPLIFIED: Only 5G/4G classification based on 0.7 Mbps threshold**
    if (speed > this.speedThreshold) {
      console.log(`✅ 5G detected: ${speed.toFixed(3)} Mbps > ${this.speedThreshold} Mbps`);
      return '5g';
    } else {
      console.log(`📶 4G detected: ${speed.toFixed(3)} Mbps ≤ ${this.speedThreshold} Mbps`);
      return '4g';
    }
  }

  async handleNetworkChange(oldType, newType) {
    console.log(`🔄 Network transition: ${oldType} -> ${newType}`);
    
    if (newType === '4g' && (oldType === '5g' || oldType === 'unknown')) {
      const pausedCount = await this.pauseAllDownloads();
      this.showNotification(`⏸️ Downloads paused - 4G detected (${pausedCount} downloads)`);
      this.updateBadge('4G', '#FF9800');
      
    } else if (newType === '5g' && (oldType === '4g' || oldType === 'unknown')) {
      const resumedCount = await this.resumePausedDownloads();
      this.showNotification(`▶️ Downloads resumed - 5G detected (${resumedCount} downloads)`);
      this.updateBadge('5G', '#4CAF50');
    }
    
    this.broadcastNetworkStatus(newType);
  }

  async pauseAllDownloads() {
    try {
      const downloads = await chrome.downloads.search({ state: 'in_progress' });
      let pausedCount = 0;
      
      for (const download of downloads) {
        try {
          await chrome.downloads.pause(download.id);
          this.pausedDownloads.add(download.id);
          pausedCount++;
          console.log(`⏸️ Paused: ${download.filename}`);
        } catch (error) {
          console.error(`Failed to pause download ${download.id}:`, error);
        }
      }
      
      return pausedCount;
    } catch (error) {
      console.error('Error pausing downloads:', error);
      return 0;
    }
  }

  async resumePausedDownloads() {
    try {
      let resumedCount = 0;
      const pausedIds = Array.from(this.pausedDownloads);
      
      for (const downloadId of pausedIds) {
        try {
          await chrome.downloads.resume(downloadId);
          this.pausedDownloads.delete(downloadId);
          resumedCount++;
          console.log(`▶️ Resumed download: ${downloadId}`);
        } catch (error) {
          console.error(`Failed to resume download ${downloadId}:`, error);
          this.pausedDownloads.delete(downloadId);
        }
      }
      
      return resumedCount;
    } catch (error) {
      console.error('Error resuming downloads:', error);
      return 0;
    }
  }

  handleNewDownload(downloadItem) {
    console.log('📥 New download started:', downloadItem.filename);
    
    if (this.currentNetworkType === '4g') {
      setTimeout(async () => {
        try {
          await chrome.downloads.pause(downloadItem.id);
          this.pausedDownloads.add(downloadItem.id);
          console.log(`⏸️ Auto-paused new download: ${downloadItem.filename}`);
          this.showNotification(`⏸️ New download paused - 4G network`);
        } catch (error) {
          console.error('Failed to auto-pause new download:', error);
        }
      }, 1000);
    }
  }

  handleDownloadChange(delta) {
    if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
      this.pausedDownloads.delete(delta.id);
    }
  }

  updateBadge(text, color) {
    try {
      chrome.action.setBadgeText({ text: text });
      chrome.action.setBadgeBackgroundColor({ color: color });
    } catch (error) {
      console.error('Failed to update badge:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      console.log('🔧 Handling message:', message.action);
      
      switch (message.action) {
        case 'ping':
          sendResponse({ success: true, timestamp: Date.now() });
          break;
          
        case 'getStatus':
          const status = {
            isEnabled: this.isEnabled,
            isMonitoring: this.isMonitoring,
            currentNetworkType: this.currentNetworkType,
            pausedDownloadsCount: this.pausedDownloads.size,
            speedThreshold: this.speedThreshold
          };
          sendResponse(status);
          break;
          
        case 'toggleEnabled':
          this.isEnabled = !this.isEnabled;
          await chrome.storage.local.set({ isEnabled: this.isEnabled });
          
          if (this.isEnabled) {
            this.startNetworkMonitoring();
            this.updateBadge('ON', '#2196F3');
          } else {
            this.stopNetworkMonitoring();
            await this.resumePausedDownloads();
            chrome.action.setBadgeText({ text: '' });
          }
          
          sendResponse({ isEnabled: this.isEnabled, success: true });
          break;
          
        case 'updateSpeedThreshold':
          this.speedThreshold = message.threshold;
          await chrome.storage.local.set({ speedThreshold: this.speedThreshold });
          sendResponse({ success: true, threshold: this.speedThreshold });
          break;
          
        case 'manualPause':
          const pausedCount = await this.pauseAllDownloads();
          sendResponse({ success: true, count: pausedCount });
          break;
          
        case 'manualResume':
          const resumedCount = await this.resumePausedDownloads();
          sendResponse({ success: true, count: resumedCount });
          break;
          
        case 'forceSpeedCheck':
          await this.checkNetworkSpeed();
          sendResponse({ 
            success: true, 
            currentType: this.currentNetworkType 
          });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
          break;
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  showNotification(message) {
    console.log('🔔 Notification:', message);
    
    try {
      chrome.notifications.create({
        type: 'basic',
        title: 'Smart Download Manager',
        message: message,
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      });
    } catch (error) {
      console.log('Notifications not available:', error);
    }
  }

  broadcastNetworkStatus(networkType) {
    chrome.runtime.sendMessage({
      action: 'networkStatusUpdate',
      networkType: networkType,
      pausedCount: this.pausedDownloads.size
    }).catch(() => {
      // Popup might not be open, ignore error
    });
  }
}

// Initialize the simplified extension
const networkManager = new NetworkDownloadManager();
