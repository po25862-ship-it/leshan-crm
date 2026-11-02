const { verifyCrmReferenceUser } = require('./_lib/crm-reference-auth');
const RECENT = new Map();
const SOURCE = 'https://nsda.post.gov.tw/StandardAddress_Public_Api/Api/AddressTrans/GetOneAddress';
function parsePostalResult(payload) {
  const data = payload?.data;
  if (!payload?.isSuccess || !data || data.errMesg || !/^\d{6}$/.test(data.zipCode || '') || !data.postAddrNo) return { zip: '', matched: false };
  return { zip: data.zipCode, matched: true, standardAddress: `${data.transAddress2 || ''}${data.transAddress3 || ''}` };
}
function handlerFactory({ verifyUser = verifyCrmReferenceUser, fetcher = fetch } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: '請使用地址查詢按鈕。' }); }
    try {
      const user = await verifyUser(req);
      const address = typeof req.body?.address === 'string' ? req.body.address.normalize('NFKC').trim() : '';
      if (address.length < 6 || address.length > 500 || /[\x00-\x1f]/.test(address)) return res.status(400).json({ error: '請填完整中文收件地址。' });
      const now = Date.now(), previous = RECENT.get(user.uid) || [];
      const times = previous.filter(t => t > now - 60000); if (times.length >= 30) return res.status(429).json({ error: '查詢較頻繁，請稍候一分鐘再試。' });
      times.push(now); RECENT.set(user.uid, times); if (RECENT.size > 10000) for (const [key, values] of RECENT) if (values.at(-1) < now - 60000) RECENT.delete(key);
      const response = await fetcher(SOURCE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Address: address, AddressResultType: [1, 2, 3], StandardAddressType: 1 }), redirect: 'error', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('postal_unavailable');
      return res.status(200).json({ ...parsePostalResult(await response.json()), source: '中華郵政全國標準郵遞地址服務平臺' });
    } catch (error) { return res.status(error.statusCode === 401 ? 401 : 503).json({ error: error.statusCode === 401 ? '請重新登入後查詢。' : '郵局查詢暫時無法連線，可稍後重試或手動核對六碼。' }); }
  };
}
module.exports = handlerFactory();
module.exports.handlerFactory = handlerFactory;
module.exports.parsePostalResult = parsePostalResult;
module.exports.config = { maxDuration: 30, api: { bodyParser: { sizeLimit: '4kb' } } };
