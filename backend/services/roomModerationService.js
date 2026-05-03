function normalizeUserId(userId) {
  return userId?.toString?.() || String(userId || "");
}

function findRoomModerationState(room, userId) {
  const normalizedUserId = normalizeUserId(userId);

  if (!Array.isArray(room.moderationStates)) {
    room.moderationStates = [];
  }

  return room.moderationStates.find(
    (item) => normalizeUserId(item.user) === normalizedUserId
  );
}

function getRoomModerationState(room, userId) {
  let state = findRoomModerationState(room, userId);

  if (!state) {
    room.moderationStates.push({
      user: userId,
      flaggedCount: 0,
      warningIssuedAt: null,
      isBanned: false,
      bannedAt: null,
      banReason: null,
      lastFlaggedAt: null
    });
    state = room.moderationStates[room.moderationStates.length - 1];
  }

  return state;
}

function isUserBannedFromRoom(room, userId) {
  const normalizedUserId = normalizeUserId(userId);

  return Array.isArray(room.bannedUsers) && room.bannedUsers.some(
    (item) => normalizeUserId(item.user) === normalizedUserId
  );
}

function applyFlagEscalation(room, userId) {
  const state = getRoomModerationState(room, userId);
  state.flaggedCount += 1;
  state.lastFlaggedAt = new Date();

  if (state.flaggedCount === 3) {
    state.warningIssuedAt = new Date();
    return {
      state,
      actionTaken: "warning_auto_removed",
      nextStatus: "removed",
      warning: "AI Guardian warning: one more violation in this room will get you kicked and banned.",
      shouldBan: false
    };
  }

  if (state.flaggedCount >= 4) {
    state.isBanned = true;
    state.bannedAt = new Date();
    state.banReason = "Repeated AI moderation violations in this room";

    if (!Array.isArray(room.bannedUsers)) {
      room.bannedUsers = [];
    }

    if (!isUserBannedFromRoom(room, userId)) {
      room.bannedUsers.push({
        user: userId,
        bannedAt: new Date(),
        reason: state.banReason
      });
    }

    return {
      state,
      actionTaken: "banned_auto_removed",
      nextStatus: "removed",
      warning: "AI Guardian removed you from this room and banned you after repeated violations.",
      shouldBan: true
    };
  }

  return {
    state,
    actionTaken: "flagged",
    nextStatus: "flagged",
    warning: null,
    shouldBan: false
  };
}

module.exports = {
  findRoomModerationState,
  getRoomModerationState,
  isUserBannedFromRoom,
  applyFlagEscalation
};
