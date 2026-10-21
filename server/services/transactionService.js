const mongoose = require('mongoose');

async function runInTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation') {
      const transactionError = new Error('This operation requires MongoDB Atlas or a replica-set deployment with transaction support.');
      transactionError.statusCode = 503;
      throw transactionError;
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = { runInTransaction };
