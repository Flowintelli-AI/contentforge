// Debug: test the simplest possible structure, then CTA slide structure
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getFonts } = require('./dist/src/fonts.js');
const satori = require('../../node_modules/satori/dist/index.cjs').default;
const { jsx, jsxs, Fragment } = require('react/jsx-runtime');

const fonts = await getFonts();

// Test 1: simple flex div with 2 children
const t1 = jsx('div', { style: { width: 1080, height: 1440, display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }, children: [
  jsx('div', { style: { width: 100, height: 100, backgroundColor: '#06b6d4' } }),
  jsx('div', { style: { width: 200, height: 50, backgroundColor: '#fff' } })
]});
try { await satori(t1, { width: 1080, height: 1440, fonts }); console.log('T1 OK: root flex div with 2 div children'); } catch(e) { console.error('T1 FAIL:', e.message); }

// Test 2: non-flex div with 1 div child
const t2 = jsx('div', { style: { width: 1080, height: 1440, backgroundColor: '#0f172a', display: 'flex' }, children:
  jsx('div', { style: { position: 'absolute', bottom: 0, left: 0, width: 1080, height: 6, backgroundColor: '#333' }, children:
    jsx('div', { style: { width: 200, height: 6, backgroundColor: '#06b6d4' } })
  })
});
try { await satori(t2, { width: 1080, height: 1440, fonts }); console.log('T2 OK: non-flex div with single div child'); } catch(e) { console.error('T2 FAIL:', e.message); }

// Test 3: absolute div with 2 children and no display
const t3 = jsx('div', { style: { width: 1080, height: 1440, display: 'flex', backgroundColor: '#0f172a', position: 'relative' }, children:
  jsx('div', { style: { position: 'absolute', bottom: 0, left: 0, width: 1080, height: 100 }, children: [
    jsx('div', { style: { width: 50, height: 50, backgroundColor: '#06b6d4' } }),
    jsx('span', {}, 'hello')
  ]})
});
try { await satori(t3, { width: 1080, height: 1440, fonts }); console.log('T3 OK'); } catch(e) { console.error('T3 FAIL (expected):', e.message); }

// Test 4: exactly like SlideFooter
const LOGO_DATA = 'data:image/png;base64,iVBORw0KGgo=';
const t4 = jsx('div', { style: { width: 1080, height: 1440, display: 'flex', backgroundColor: '#0f172a', position: 'relative' }, children:
  jsx('div', { style: { position: 'absolute', bottom: 60, left: 0, width: 1080, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 110, paddingRight: 80 }, children: [
    jsx('span', { style: { color: '#94a3b8', fontSize: 24, fontFamily: 'Poppins', fontWeight: 400 } }, '01 / 10'),
    jsx('div', { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [
      jsx('span', { style: { color: '#f8fafc', fontSize: 22, fontFamily: 'Poppins', fontWeight: 600 } }, 'Flowintelli')
    ]})
  ]})
});
try { await satori(t4, { width: 1080, height: 1440, fonts }); console.log('T4 OK: SlideFooter-like'); } catch(e) { console.error('T4 FAIL:', e.message); }
