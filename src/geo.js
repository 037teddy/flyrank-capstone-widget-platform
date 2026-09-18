require('dotenv').config();

// Toggles let us deterministically prove the fallback chain in tests
// (see EVIDENCE.md) without depending on real providers being up/down.
const MOCK_PROVIDER_A = process.env.MOCK_GEO_PROVIDER_A; // 'success' | 'fail' | undefined
const MOCK_PROVIDER_B = process.env.MOCK_GEO_PROVIDER_B; // 'success' | 'fail' | undefined
async function fetchFromProviderA(ip) {
  if (MOCK_PROVIDER_A === 'fail') {
    throw new Error('Provider A mocked failure');
  }
  if (MOCK_PROVIDER_A === 'success') {
    return { country: 'Mockland', city: 'Mock City A' };
  }
  if (PROVIDER_A_DISABLED) {
    throw new Error('Provider A manually disabled');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Provider A returned ${res.status}`);
    const data = await res.json();
    if (data.status === 'fail') throw new Error('Provider A lookup failed');
    return { country: data.country, city: data.city };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function fetchFromProviderB(ip) {
  if (MOCK_PROVIDER_B === 'fail') {
    throw new Error('Provider B mocked failure');
  }
  if (MOCK_PROVIDER_B === 'success') {
    return { country: 'Mockland', city: 'Mock City B' };
  }
  if (PROVIDER_B_DISABLED) {
    throw new Error('Provider B manually disabled');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Provider B returned ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error('Provider B lookup failed');
    return { country: data.country_name, city: data.city };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
async function enrichWithGeo(ip) {
  try {
    const result = await fetchFromProviderA(ip);
    return { ...result, provider_used: 'A' };
  } catch (errA) {
    console.log(`Geo provider A failed: ${errA.message}, trying provider B`);
    try {
      const result = await fetchFromProviderB(ip);
      return { ...result, provider_used: 'B' };
    } catch (errB) {
      console.log(`Geo provider B failed: ${errB.message}, proceeding without geo data`);
      return { country: null, city: null, provider_used: null };
    }
  }
}

module.exports = { enrichWithGeo };