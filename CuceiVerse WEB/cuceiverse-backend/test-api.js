const axios = require('axios');

async function testApi() {
  const BASE_URL = 'http://localhost:3001';
  
  // Script de prueba de API SIIAU
  // Instrucciones: Pon tus credenciales reales en 'codigo' y 'nip' para probar el scraping.
  const credentials = {
    codigo: 'TU_CODIGO',
    nip: 'TU_NIP'
  };

  try {
    console.log('--- 1. Probando Login ---');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, credentials);
    const token = loginRes.data.accessToken || loginRes.data.token;
    console.log('✅ Login exitoso. Token recibido.');

    console.log('\n--- 2. Solicitando Snapshot de SIIAU (Scraping) ---');
    await axios.get(`${BASE_URL}/siiau/session-snapshot`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Petición de snapshot enviada.');

    console.log('\n--- 3. Polling de resultados (esperando a SIIAU) ---');
    for (let i = 0; i < 40; i++) {
      const statusRes = await axios.get(`${BASE_URL}/siiau/session-snapshot`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const { status, error } = statusRes.data;
      console.log(`Intento ${i + 1}: Estado = ${status}`);
      
      if (status === 'ready') {
        console.log('🚀 ¡ÉXITO! Datos de SIIAU cargados correctamente.');
        console.log('Carrera:', statusRes.data.snapshot.careerName);
        console.log('Promedio:', statusRes.data.snapshot.average);
        return;
      }
      
      if (status === 'error') {
        console.error('❌ Error de SIIAU:', error);
        return;
      }

      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('⚠️ El proceso tardó demasiado (Timeout de prueba).');

  } catch (error) {
    console.error('❌ Error en la prueba:', error.response?.data || error.message);
  }
}

testApi();
