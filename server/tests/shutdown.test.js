// SIGTERM must wait for the store to flush its pending writes before exiting.

process.env.SERVICE_ROLE = 'terminal';
process.env.PORT = '0';

const mockStore = { flush: jest.fn() };
const mockManager = {
  init: jest.fn(() => Promise.resolve()),
  shutdown: jest.fn(() => Promise.resolve()),
};

jest.mock('../lib/store', () => ({ getStore: () => mockStore }));
jest.mock('../services/sandboxManager', () => ({ getManager: () => mockManager }));
jest.mock('../services/terminalService', () => ({
  attachTerminalWebSocket: () => ({ clients: new Set() }),
}));

const { start } = require('../server');

describe('SIGTERM shutdown', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockStore.flush.mockReset();
  });

  test('does not exit until pending store writes have flushed', async () => {
    let finishFlush;
    mockStore.flush.mockReturnValue(new Promise((resolve) => { finishFlush = resolve; }));
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const on = jest.spyOn(process, 'on').mockImplementation(() => process);

    start();
    const [, onSigterm] = on.mock.calls.find(([signal]) => signal === 'SIGTERM');
    const done = onSigterm();

    await new Promise((resolve) => setImmediate(resolve));
    expect(mockStore.flush).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    finishFlush();
    await done;
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('still exits cleanly when the store flush fails', async () => {
    const failedFlush = Promise.reject(new Error('disk full'));
    failedFlush.catch(() => {});
    mockStore.flush.mockReturnValue(failedFlush);
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const on = jest.spyOn(process, 'on').mockImplementation(() => process);

    start();
    const [, onSigterm] = on.mock.calls.find(([signal]) => signal === 'SIGTERM');
    await onSigterm();

    expect(mockStore.flush).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
