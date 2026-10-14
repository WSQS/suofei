#!/usr/bin/env node
// 自测：apksigner 输出的解析与三路判定（用**两个平台的真实样本** + 反例喂给纯函数）。
//
//   node release/selftest-apksigner.mjs
//
// 为什么要有它：我第一版把 DN 前缀写死成 `Signer #\d+`（Windows 的写法），
// CI（Linux）上是 `V2 Signer: certificate DN:` ⇒ **验签通过却因为读不出 DN 被判红**。
// 光改正则不算验证过 —— 所以把两边的输出样本固化成 fixture，让解析与判定可复现地跑。
//
// 注意：样本里的 DN 是**公开的证书信息**（不是密钥材料）；口令/密钥从不出现在这里。

import { decideSigning, isDebugCertificate, parseCertificateDns } from './lib/apksigner.mjs';

// ── fixture 1：Windows 本机实测的 apksigner 输出（`Signer #N certificate DN:`）──
const WINDOWS_OUTPUT = `Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): false
Number of signers: 1
Signer #1 certificate DN: CN=Suofei, OU=suofei, O=WSQS, C=CN
Signer #1 certificate SHA-256 digest: 0000000000000000000000000000000000000000000000000000000000000000
Signer #1 certificate SHA-1 digest: 0000000000000000000000000000000000000000
`;

// ── fixture 2：CI（Linux runner）实测的输出（`V2 Signer: certificate DN:`）──
//    负责人抓到的就是这一路：验签通过，但前缀不同 ⇒ 旧解析读不出来。
const LINUX_OUTPUT = `Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
V2 Signer: certificate DN: CN=Suofei, OU=***, O=WSQS, C=CN | V2 Signer: certificate SHA-256 digest: 1111111111111111111111111111111111111111111111111111111111111111
`;

// ── fixture 3：Linux 上**换成 debug 证书**的样子（用来证明「跨前缀也能认出 debug」）──
const LINUX_DEBUG_OUTPUT = `Verifies
V2 Signer: certificate DN: CN=Android Debug, O=Android, C=US
V2 Signer: certificate SHA-256 digest: 2222222222222222222222222222222222222222222222222222222222222222
`;

// ── fixture 4：多个 signer（v2 + v3），其中一个是 debug ⇒ 必须判红 ──
const MULTI_SIGNER_OUTPUT = `Verifies
V2 Signer: certificate DN: CN=Suofei, OU=suofei, O=WSQS, C=CN
V3 Signer: certificate DN: CN=Android Debug, O=Android, C=US
`;

// ── fixture 5：验签通过但输出里没有任何 DN（格式变了）⇒ 必须黄，不能红 ──
const NO_DN_OUTPUT = `Verifies
Number of signers: 1
(此版本的 apksigner 用了某种我们没见过的写法输出证书信息)
`;

// ── fixture 6：验签失败（未签名包）⇒ 必须红 ──
const UNSIGNED_OUTPUT = `DOES NOT VERIFY
ERROR: Missing META-INF/MANIFEST.MF
`;

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    console.log(`PASS  ${name}${detail ? `\n        ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
};

console.log('=== 1) 解析：Windows 写法（Signer #N certificate DN:）===');
{
  const dns = parseCertificateDns(WINDOWS_OUTPUT);
  console.log(`  样本：\n${WINDOWS_OUTPUT.trim().split('\n').filter((l) => /certificate DN/i.test(l)).map((l) => '    ' + l).join('\n')}`);
  console.log(`  解析结果：${JSON.stringify(dns)}`);
  check('Windows 样本解出 1 个 DN 且值正确', dns.length === 1 && dns[0] === 'CN=Suofei, OU=suofei, O=WSQS, C=CN', JSON.stringify(dns));
}

console.log('\n=== 2) 解析：CI/Linux 写法（V2 Signer: certificate DN: … | … digest）===');
{
  const dns = parseCertificateDns(LINUX_OUTPUT);
  console.log(`  样本：\n${LINUX_OUTPUT.trim().split('\n').filter((l) => /certificate DN/i.test(l)).map((l) => '    ' + l).join('\n')}`);
  console.log(`  解析结果：${JSON.stringify(dns)}`);
  check('Linux 样本解出 1 个 DN，且把同行的 digest 切掉', dns.length === 1 && dns[0] === 'CN=Suofei, OU=***, O=WSQS, C=CN', JSON.stringify(dns));
  check('Linux 样本不被误判为 debug 证书', isDebugCertificate(dns) === false);
}

console.log('\n=== 3) 判定：三路必须分开（这正是 CI 上被误判成红的那件事）===');
{
  const pass = decideSigning({ verifyOk: true, exitCode: 0, output: WINDOWS_OUTPUT });
  check('① Windows 样本 ⇒ PASS 且带上 DN', pass.status === 'PASS' && pass.dns[0] === 'CN=Suofei, OU=suofei, O=WSQS, C=CN', `${pass.status}｜${pass.detail}`);

  const passLinux = decideSigning({ verifyOk: true, exitCode: 0, output: LINUX_OUTPUT });
  check('② Linux 样本 ⇒ PASS（**旧版本在这里会错判成 FAIL**）', passLinux.status === 'PASS' && passLinux.dns[0] === 'CN=Suofei, OU=***, O=WSQS, C=CN', `${passLinux.status}｜${passLinux.detail}`);

  const noDn = decideSigning({ verifyOk: true, exitCode: 0, output: NO_DN_OUTPUT });
  check('③ 验签通过但无 DN ⇒ **WARN（黄）**，不是 FAIL', noDn.status === 'WARN', `${noDn.status}｜${noDn.detail.split('\n')[0]}`);

  const debugLinux = decideSigning({ verifyOk: true, exitCode: 0, output: LINUX_DEBUG_OUTPUT });
  check('④ Linux 写法里的 debug 证书 ⇒ FAIL', debugLinux.status === 'FAIL' && /Android Debug/.test(debugLinux.detail), `${debugLinux.status}｜${debugLinux.detail.split('\n')[0]}`);

  const multi = decideSigning({ verifyOk: true, exitCode: 0, output: MULTI_SIGNER_OUTPUT });
  check('⑤ 多 signer 里任一为 debug ⇒ FAIL（逐个都查，不只看第一个）', multi.status === 'FAIL', `${multi.status}｜${multi.detail.split('\n')[0]}`);

  const unsigned = decideSigning({ verifyOk: false, exitCode: 1, output: UNSIGNED_OUTPUT });
  check('⑥ 验签失败 ⇒ FAIL', unsigned.status === 'FAIL' && /未通过/.test(unsigned.detail), `${unsigned.status}｜${unsigned.detail.split('\n')[0]}`);
}

console.log('\n================ 汇总 ================');
console.log(failed ? `失败 ${failed} 项` : '全部通过');
process.exitCode = failed ? 1 : 0;
