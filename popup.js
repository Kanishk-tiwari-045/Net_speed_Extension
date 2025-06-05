// Simplified Popup controller for speed-based 5G/4G detection
class PopupController {
  constructor() {
    this.isBackgroundReady = false;
    this.initializeUI();
    this.startStatusUpdates();
  }

  initializeUI() {
    // Get essential UI elements only
    this.elements = {
      status: document.getElementById('status'),
      networkType: document.getElementById('networkType'),
      networkIndicator: document.getElementById('networkIndicator'),
      pausedCount: document.getElementById('pausedCount'),
      toggleBtn: document.getElementById('toggleBtn'),
      pauseBtn: document.getElementById('pauseBtn'),
      resumeBtn: document.getElementById('resumeBtn'),
      forceCheckBtn: document.getElementById('forceCheckBtn'),
      speedThreshold: document.getElementById('speedThreshold'),
      saveSettings: document.getElementById('saveSettings'),
      networkDetails: document.getElementById('networkDetails')
    };

    this.setupEventListeners();
    this.setupMessageListener();
  }

  setupEventListeners() {
    // Set up event listeners with null checks
    this.safeAddEventListener('toggleBtn', 'click', () => this.toggleExtension());
    this.safeAddEventListener('pauseBtn', 'click', () => this.manualPause());
    this.safeAddEventListener('resumeBtn', 'click', () => this.manualResume());
    this.safeAddEventListener('forceCheckBtn', 'click', () => this.forceSpeedCheck());
    this.safeAddEventListener('saveSettings', 'click', () => this.saveSettings());
  }

  safeAddEventListener(elementId, event, handler) {
    if (this.elements[elementId]) {
      this.elements[elementId].addEventListener(event, handler);
    }
  }

  setupMessageListener() {
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'networkStatusUpdate') {
          this.updateNetworkDisplay(message.networkType, message.pausedCount);
        }
      });
    } catch (error) {
      console.error('Failed to setup message listener:', error);
    }
  }

  startStatusUpdates() {
    // Initial load
    this.loadStatus();
    
    // Update status every 3 seconds
    setInterval(() => {
      this.loadStatus();
    }, 3000);
  }

  async loadStatus() {
    try {
      this.safeSetText('status', 'Loading...');

      const response = await this.sendMessageSafely({ action: 'getStatus' });
      
      if (response) {
        this.updateUI(response);
        this.isBackgroundReady = true;
      }
    } catch (error) {
      console.error('Failed to load status:', error);
      this.showError('Connection failed');
    }
  }

  async sendMessageSafely(message, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, timeout);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeoutId);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  updateUI(status) {
    try {
      // Update status
      this.safeSetText('status', status.isEnabled ? 
        (status.isMonitoring ? 'Active' : 'Enabled') : 'Disabled');
      
      // Update toggle button
      if (this.elements.toggleBtn) {
        this.elements.toggleBtn.textContent = status.isEnabled ? 'Disable' : 'Enable';
        this.elements.toggleBtn.className = status.isEnabled ? 'danger' : 'primary';
      }
      
      // Update network display
      this.updateNetworkDisplay(status.currentNetworkType || 'unknown', status.pausedDownloadsCount || 0);
      
      // Update speed threshold
      if (this.elements.speedThreshold && status.speedThreshold) {
        this.elements.speedThreshold.value = status.speedThreshold;
      }
    } catch (error) {
      console.error('Error updating UI:', error);
    }
  }

  updateNetworkDisplay(networkType, pausedCount) {
    try {
      // Update network type display
      this.safeSetText('networkType', (networkType || 'UNKNOWN').toUpperCase());
      this.safeSetText('pausedCount', `${pausedCount || 0} paused`);
      
      // Update network indicator
      if (this.elements.networkIndicator) {
        this.elements.networkIndicator.className = `network-indicator network-${networkType || 'unknown'}`;
      }
      
      // Update network quality
      this.safeSetText('networkDetails', this.getNetworkQuality(networkType));
    } catch (error) {
      console.error('Error updating network display:', error);
    }
  }

  getNetworkQuality(networkType) {
    switch (networkType) {
      case '5g': return 'High Speed (>0.7 Mbps)';
      case '4g': return 'Moderate Speed (≤0.7 Mbps)';
      default: return 'Unknown Speed';
    }
  }

  async toggleExtension() {
    try {
      const response = await this.sendMessageSafely({ action: 'toggleEnabled' });
      
      if (response && this.elements.toggleBtn && this.elements.status) {
        this.elements.toggleBtn.textContent = response.isEnabled ? 'Disable' : 'Enable';
        this.elements.toggleBtn.className = response.isEnabled ? 'danger' : 'primary';
        this.safeSetText('status', response.isEnabled ? 'Active' : 'Disabled');
        this.showFeedback(response.isEnabled ? 'Extension enabled' : 'Extension disabled');
      }
    } catch (error) {
      console.error('Failed to toggle extension:', error);
      this.showFeedback('Failed to toggle extension');
    }
  }

  async manualPause() {
    try {
      const response = await this.sendMessageSafely({ action: 'manualPause' });
      this.showFeedback(`Paused ${response?.count || 0} downloads`);
      setTimeout(() => this.loadStatus(), 1000);
    } catch (error) {
      console.error('Failed to pause downloads:', error);
      this.showFeedback('Failed to pause downloads');
    }
  }

  async manualResume() {
    try {
      const response = await this.sendMessageSafely({ action: 'manualResume' });
      this.showFeedback(`Resumed ${response?.count || 0} downloads`);
      setTimeout(() => this.loadStatus(), 1000);
    } catch (error) {
      console.error('Failed to resume downloads:', error);
      this.showFeedback('Failed to resume downloads');
    }
  }

  async forceSpeedCheck() {
    try {
      const response = await this.sendMessageSafely({ action: 'forceSpeedCheck' });
      this.showFeedback(`Speed check: ${response?.currentType?.toUpperCase() || 'Unknown'}`);
      setTimeout(() => this.loadStatus(), 500);
    } catch (error) {
      console.error('Failed to force speed check:', error);
      this.showFeedback('Failed to check speed');
    }
  }

  async saveSettings() {
    try {
      if (!this.elements.speedThreshold) {
        this.showFeedback('Speed threshold input not found');
        return;
      }

      const threshold = parseFloat(this.elements.speedThreshold.value);
      
      if (isNaN(threshold) || threshold <= 0) {
        this.showFeedback('Invalid threshold value');
        return;
      }

      await this.sendMessageSafely({ 
        action: 'updateSpeedThreshold', 
        threshold: threshold 
      });
      this.showFeedback('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showFeedback('Failed to save settings');
    }
  }

  safeSetText(elementId, text) {
    if (this.elements[elementId]) {
      this.elements[elementId].textContent = text;
    }
  }

  showError(message) {
    this.safeSetText('status', message);
    if (this.elements.status) {
      this.elements.status.style.color = '#f44336';
    }
  }

  showFeedback(message) {
    let feedback = document.getElementById('feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'feedback';
      feedback.className = 'feedback';
      document.body.appendChild(feedback);
    }
    
    feedback.textContent = message;
    feedback.style.display = 'block';
    
    setTimeout(() => {
      feedback.style.display = 'none';
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    new PopupController();
  } catch (error) {
    console.error('Failed to initialize popup:', error);
  }
});
