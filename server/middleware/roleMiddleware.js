function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `User role '${req.user?.role}' is not authorized to access this resource.`,
      });
    }
    return next();
  };
}

function applyLeadRLS(req) {
  if (req.user.role === 'admin') {
    return {};
  }
  if (req.user.role === 'specialist') {
    return {
      $and: [
        { popiaConsentVerbalConfirmed: true },
        { zeroChildrenDataCertified: true },
        {
          $or: [
            { assignedSpecialist: req.user._id },
            { assignedSpecialist: null },
          ],
        },
      ],
    };
  }
  return { consultant: req.user._id };
}

module.exports = { authorize, applyLeadRLS };
