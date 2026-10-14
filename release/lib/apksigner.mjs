// apksigner 输出的解析与「签名是否合格」的判定（**跨平台**，可单测）。
//
// ⚠️ 真踩过（负责人 CI 实测抓到）：本机 Windows 的 apksigner 打
//     `Signer #1 certificate DN: CN=…`
//   而 CI（Linux runner）上是
//     `V2 Signer: certificate DN: CN=…`
//   我第一版把前缀写死成 `Signer #\d+`，于是 **CI 上验签其实已经通过、却因为「读不出 DN」被判红** ——
//   这是「把解析失败当成签名不合格」，语义错了（也把一条好消息报成了红）。
//
// 现在只认**共同子串** `certificate DN:`，对所有前缀（`Signer #N` / `V2 Signer` / `V3 Signer` …）都成立；
// 并且把结果分成三种，不混成一种红：
//   ① 验签失败                 ⇒ FAIL（红）
//   ② 验签通过但读不出任何 DN   ⇒ WARN（黄）—— 产物确实是签过且验过的，只是**身份没读出来**，要人看日志
//   ③ 验签通过且读出 DN         ⇒ 任一 signer 是 debug 证书 ⇒ FAIL；否则 PASS（把 DN 写进回执）

/**
 * 抽出输出里所有证书 DN（跨平台通用；不绑定 signer 前缀）。
 * 同一张证书在 v2/v3 下可能被报两次 ⇒ 去重但保持首次出现的顺序。
 * @param {string} output
 * @returns {string[]}
 */
export function parseCertificateDns(output) {
  const found = [];
  for (const m of String(output ?? '').matchAll(/certificate\s+DN\s*:\s*(.+)/gi)) {
    // 有些版本会把它和 digest 打在同一行（用 `|` 分隔）⇒ 只取 `|` 之前的部分。
    const value = m[1].split('|')[0].trim().replace(/[;,]+$/, '');
    if (value && !found.includes(value)) found.push(value);
  }
  return found;
}

/** 任一 signer 的 DN 是 debug 证书吗（Android 的 debug keystore 固定 `CN=Android Debug`）。 */
export function isDebugCertificate(dns) {
  return (dns ?? []).some((dn) => /CN\s*=\s*Android\s+Debug/i.test(dn));
}

/**
 * 三路判定（纯函数，便于用 fixture 单测）。
 * @param {{verifyOk: boolean, exitCode?: number|null, output?: string}} args
 * @returns {{status: 'PASS'|'WARN'|'FAIL', detail: string, dns: string[]}}
 */
export function decideSigning({ verifyOk, exitCode = null, output = '' }) {
  const text = String(output ?? '');
  const head = text.trim().split('\n').slice(0, 6).map((l) => `   ${l}`).join('\n');
  if (!verifyOk) {
    return {
      status: 'FAIL',
      dns: [],
      detail: `apksigner verify 未通过（退出码 ${exitCode ?? 'n/a'}）—— 这份产物**不能当作已签名包**：\n${head}`,
    };
  }
  const dns = parseCertificateDns(text);
  if (dns.length === 0) {
    // 关键：验签**通过**了 ⇒ 这不是「签名不合格」，而是「身份没读出来」。不能判红（那会把好消息报成坏消息），
    // 也不能判绿（那等于假装确认过证书身份）⇒ 黄，并让人去看日志。
    return {
      status: 'WARN',
      dns,
      detail:
        'apksigner verify **通过**了（产物确实被签过、且签名有效），但**读不出证书 DN** ⇒ 无法确认签名身份。\n' +
        '   常见原因：apksigner 版本不同、输出格式变了（本门按 `certificate DN:` 这个共同子串解析）。\n' +
        '   **这不是「签名不合格」**，但也不能当绿：请人工看日志确认证书身份。\n' +
        `   输出前几行：\n${head}`,
    };
  }
  if (isDebugCertificate(dns)) {
    const bad = dns.filter((d) => /CN\s*=\s*Android\s+Debug/i.test(d));
    return {
      status: 'FAIL',
      dns,
      detail:
        `这份产物是 **debug 证书**签的（DN: ${bad.join(' / ')}）——\n` +
        '   正是「以为发的是正式签名包、实际是 debug 包」：不得发布（要用四项 SUOFEI_* 环境变量提供的密钥重签）。',
    };
  }
  return { status: 'PASS', dns, detail: `apksigner verify 通过｜证书 DN：${dns.join(' / ')}` };
}
