function safeSend(targetWindow, channel, ...args) {
  if (!targetWindow || targetWindow.isDestroyed()) return false;
  const contents = targetWindow.webContents;
  if (!contents || contents.isDestroyed()) return false;
  try {
    contents.send(channel, ...args);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  safeSend
};
