// Simplified content script for speed-based network monitoring
(function() {
  'use strict';
  
  class ContentNetworkMonitor {
    constructor() {
      this.setupNetworkMonitoring();
    }
    
    setupNetworkMonitoring() {
      // Monitor browser network API changes
      if ('connection' in navigator) {
        navigator.connection.addEventListener('change', () => {
          this.reportNetworkChange();
        });
        
        // Initial report
        this.reportNetworkChange();
      }
      
      // Monitor page performance for speed estimation
      this.monitorPagePerformance();
    }
    
    reportNetworkChange() {
      const connectionInfo = {
        effectiveType: navigator.connection?.effectiveType,
        downlink: navigator.connection?.downlink,
        rtt: navigator.connection?.rtt,
        timestamp: Date.now(),
        url: window.location.hostname
      };
      
      console.log('📡 Content: Network change detected', connectionInfo);
      
      // Send to background script
      this.sendMessageSafely({
        action: 'contentNetworkUpdate',
        data: connectionInfo
      });
    }
    
    monitorPagePerformance() {
      // Use PerformanceObserver for page load speed
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.entryType === 'navigation') {
                this.reportPerformanceData(entry);
              }
            }
          });
          
          observer.observe({ entryTypes: ['navigation'] });
        } catch (error) {
          console.log('PerformanceObserver not supported');
        }
      }
    }
    
    reportPerformanceData(entry) {
      const performanceData = {
        loadTime: entry.loadEventEnd - entry.loadEventStart,
        transferSize: entry.transferSize || 0,
        timestamp: Date.now(),
        url: window.location.hostname
      };
      
      // Calculate estimated speed
      if (performanceData.transferSize > 0 && performanceData.loadTime > 0) {
        performanceData.estimatedSpeed = (performanceData.transferSize * 8) / (performanceData.loadTime / 1000) / 1000000; // Mbps
      }
      
      console.log('📊 Content: Performance data', performanceData);
      
      this.sendMessageSafely({
        action: 'performanceUpdate',
        data: performanceData
      });
    }
    
    sendMessageSafely(message) {
      try {
        chrome.runtime.sendMessage(message).catch((error) => {
          console.log('Message send failed:', error.message);
        });
      } catch (error) {
        console.log('Unexpected error sending message:', error);
      }
    }
  }
  
  // Initialize content monitor
  try {
    new ContentNetworkMonitor();
    console.log('📡 Content Network Monitor initialized');
  } catch (error) {
    console.error('Failed to initialize Content Network Monitor:', error);
  }
})();
