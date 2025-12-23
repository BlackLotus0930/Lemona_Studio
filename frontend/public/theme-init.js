/**
 * Theme initialization script
 * This must run synchronously before any rendering to prevent white flash.
 * Reads theme from localStorage and applies it immediately to document.documentElement.
 */
(function() {
  'use strict';
  
  try {
    // Read theme from localStorage synchronously (before React loads)
    var savedTheme = localStorage.getItem('theme');
    var isDark = savedTheme !== 'light'; // Default to dark if not set or invalid
    
    // Apply theme class to html element immediately (body not ready yet)
    if (isDark) {
      document.documentElement.classList.add('dark-theme');
      document.documentElement.style.backgroundColor = '#141414';
    } else {
      document.documentElement.classList.remove('dark-theme');
      document.documentElement.style.backgroundColor = '#ffffff';
    }
  } catch (e) {
    // If localStorage fails (e.g., in private browsing), default to dark
    document.documentElement.classList.add('dark-theme');
    document.documentElement.style.backgroundColor = '#141414';
  }
})();

