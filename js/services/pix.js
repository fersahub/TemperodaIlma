/* Geração local Pix e QR Code; lógica original preservada. */
/* --- PIX COPIA E COLA + QR CODE (padrão BR Code do Banco Central) --- */
        function crc16(str) {
            let crc = 0xFFFF;
            for (let i = 0; i < str.length; i++) {
                crc ^= str.charCodeAt(i) << 8;
                for (let j = 0; j < 8; j++) {
                    crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
                    crc &= 0xFFFF;
                }
            }
            return crc.toString(16).toUpperCase().padStart(4, '0');
        }

        function emv(id, valor) { return id + String(valor.length).padStart(2, '0') + valor; }

        function semAcentos(t) {
            return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase();
        }

        function gerarPixPayload(valor) {
            const chave = CONFIG.pixChave.trim();
            const nome = semAcentos(CONFIG.pixNome).slice(0, 25) || 'RECEBEDOR';
            const cidade = semAcentos(CONFIG.pixCidade).slice(0, 15) || 'SALVADOR';
            const conta = emv('00', 'br.gov.bcb.pix') + emv('01', chave);
            let p = emv('00', '01') + emv('01', '11') + emv('26', conta) + emv('52', '0000') + emv('53', '986')
                + emv('54', valor.toFixed(2)) + emv('58', 'BR') + emv('59', nome) + emv('60', cidade)
                + emv('62', emv('05', '***')) + '6304';
            return p + crc16(p);
        }

        function pixConfigurado() { return !!CONFIG.pixChave && !/SUA-CHAVE/i.test(CONFIG.pixChave); }

        function desenharQr(elId, texto) {
            const el = document.getElementById(elId);
            if (!el) return;
            try {
                const qr = qrcode(0, 'M');
                qr.addData(texto);
                qr.make();
                el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
                const svg = el.querySelector('svg');
                if (svg) {
                    svg.setAttribute('width', '176');
                    svg.setAttribute('height', '176');
                    svg.setAttribute('role', 'img');
                    svg.setAttribute('aria-label', 'QR Code do Pix');
                }
            } catch (e) { el.innerHTML = ''; }
        }

        async function copiarPixCopiaECola() {
            if (!pixAtual) return;
            try {
                await navigator.clipboard.writeText(pixAtual);
                mostrarToast('Código Pix copiado! Cole no app do seu banco, em "Pix copia e cola".', null, null, 6000);
            } catch (e) { window.prompt('Copie o código Pix:', pixAtual); }
        }

        function atualizarPixBox() {
            const box = document.getElementById('pix-container');
            if (!box) return;
            const pix = document.getElementById('cust-payment').value === 'Pix';
            box.classList.toggle('hidden', !pix);
            if (!pix) return;
            const sub = cartCombos.reduce((sum, i) => sum + i.price, 0);
            const fe = freteEfetivo();
            const area = document.getElementById('pix-qr-area');
            document.getElementById('pix-chave').innerText = CONFIG.pixChave;
            if (fe === null) {
                document.getElementById('pix-valor').innerText = 'calcule o frete para ver o total';
                area.classList.add('hidden');
                return;
            }
            const total = sub + fe;
            document.getElementById('pix-valor').innerText = 'R$ ' + total.toFixed(2).replace('.', ',');
            if (pixConfigurado() && total > 0) {
                pixAtual = gerarPixPayload(total);
                desenharQr('pix-qr', pixAtual);
                area.classList.remove('hidden');
            } else {
                area.classList.add('hidden');
            }
        }

        async function copiarPix() {
            try { await navigator.clipboard.writeText(CONFIG.pixChave); mostrarToast('Chave Pix copiada!'); }
            catch (e) { mostrarToast('Chave Pix: ' + CONFIG.pixChave, null, null, 9000); }
        }
