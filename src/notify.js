// A "safe side effect" — its failure must never block the main submission.
async function sendConfirmationNotification(submission, shouldFail = false) {
  try {
    if (shouldFail) {
      throw new Error('Simulated notification failure');
    }
    // In production this would send a real email or webhook.
    console.log(`[NOTIFICATION] Confirmation sent for submission ${submission.id}`);
  } catch (err) {
    console.error(`[NOTIFICATION FAILED] ${err.message} — submission ${submission.id} was still stored successfully`);
  }
}

module.exports = { sendConfirmationNotification };