/**
 * Jest setup file to handle cross-platform TensorFlow.js compatibility issues.
 * 
 * For tests, we pre-load the TensorFlow.js backend to ensure compatibility.
 */

// On Windows CI, we need to handle native module loading differently
if (process.platform === 'win32' && process.env.CI) {
  console.log('🪟 Windows CI detected - TensorFlow.js will use CPU backend');
  // Set environment variable to indicate fallback mode
  process.env.TF_FORCE_CPU_BACKEND = 'true';
}

// Try to load TensorFlow.js Node backend
try {
  require('@tensorflow/tfjs-node');
  console.log('✓ Using @tensorflow/tfjs-node backend for tests');
} catch (error) {
  console.warn('⚠️  @tensorflow/tfjs-node failed to load:', error.message);
  console.log('🔄 Tests will use fallback backend');
  // Set environment variable to indicate fallback mode
  process.env.TF_FORCE_CPU_BACKEND = 'true';
}

// Set longer timeout for tests that might need to compile TensorFlow operations
jest.setTimeout(30000);