import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import { calculateFiscalData } from './CalcolatriceFiscale'; // Importiamo la calcolatrice

// Helper per formattare la durata (es. 4h 30m)
const formatDuration = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
};

// Helper per data italiana leggibile (per l'Audit)
const formatDateItalian = (isoString) => {
    if (!isoString) return "---";
    return new Date(isoString).toLocaleString('it-IT', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    });
};

// --- GENERA HTML ---
const createHTML = (docTitle, shifts, totalAmount, totalHours, reportType) => {
    
    // 🔴 1. MODALITÀ AUDIT (Registro modifiche) 🔴
    if (reportType === 'AUDIT') {
        const rows = shifts.map(shift => {
            return `
            <tr class="item-row">
                <td style="width:20%; font-weight:bold;">${formatDateItalian(shift.createdAt)}</td>
                <td style="width:25%; color:#E65100;">${shift.creatorName || 'Sistema'}</td>
                <td style="width:25%;">${shift.collaboratorName || '---'}</td>
                <td style="width:30%; font-family:monospace;">${shift.location} <br> (${shift.startTime}-${shift.endTime})</td>
            </tr>
            `;
        }).join('');

        return `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              h1 { text-align: center; color: #DA3633; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; }
              th { background-color: #333; color: #FFF; padding: 8px; text-align: left; }
              td { padding: 8px; border-bottom: 1px solid #ddd; }
              .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999; }
            </style>
          </head>
          <body>
            <h1>⚠️ REGISTRO AUDIT (LOG)</h1>
            <table>
              <thead>
                <tr>
                  <th>DATA CREAZIONE</th>
                  <th>CHI HA CREATO</th>
                  <th>ASSEGNATO A</th>
                  <th>DETTAGLI TURNO</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="footer">Generato il ${new Date().toLocaleString()}</div>
          </body>
        </html>
        `;
    }

    // 🟢 2. MODALITÀ STANDARD (Report Turni) 🟢
    // Qui aggiungiamo le colonne PAUSA, DURATA e STATO
    const rows = shifts.map(shift => {
        // USIAMO LA CALCOLATRICE per avere i soldi giusti
        const { cost, minutes } = calculateFiscalData(shift);
        
        // Formattiamo la pausa
        const pausa = shift.breakMinutes ? `${shift.breakMinutes}m` : '0m';
        
        // Formattiamo lo stato (Colore dinamico)
        const stato = shift.status ? shift.status.toUpperCase() : '---';
        let statoColor = '#000';
        if (shift.status === 'completato') statoColor = '#238636'; // Verde
        else if (shift.status === 'assente') statoColor = '#DA3633'; // Rosso
        else if (shift.status === 'in-corso') statoColor = '#D97706'; // Arancio

        // Se è REPORT TOTALE ('FULL'), mostriamo il nome del collaboratore
        const isGlobal = (reportType === 'FULL');
        const collabCell = isGlobal ? `<td style="font-weight:bold;">${shift.collaboratorName}</td>` : '';

        return `
        <tr class="item-row">
            <td>${shift.date}</td>
            ${collabCell}
            <td>${shift.location}</td>
            <td>${shift.startTime}-${shift.endTime}</td>
            
            <td style="font-weight:bold;">${formatDuration(minutes)}</td>
            <td>${pausa}</td>
            <td style="color:${statoColor}; font-weight:bold; font-size:10px;">${stato}</td>
            
            <td>€${shift.payoutRate}</td>
            <td style="font-weight:bold;">€ ${cost}</td>
        </tr>
        `;
    }).join('');

    // Intestazione tabella dinamica (se Global o Singolo)
    const isGlobal = (reportType === 'FULL');
    const collabHeader = isGlobal ? '<th>COLLABORATORE</th>' : '';

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            h1 { font-size: 22px; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
            h2 { font-size: 12px; color: #666; margin-top: 5px; font-weight: normal; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th { background-color: #f2f2f2; color: #000; padding: 8px; text-align: left; border-bottom: 2px solid #999; text-transform: uppercase; font-size: 10px; }
            td { padding: 8px; border-bottom: 1px solid #eee; }
            .item-row:nth-child(even) { background-color: #f9f9f9; }
            
            .total-box { float: right; margin-top: 20px; width: 40%; text-align: right; }
            .total-row { font-size: 12px; margin-bottom: 5px; color: #666; }
            .grand-total { font-size: 18px; font-weight: bold; color: #000; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
            
            .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; clear: both; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${docTitle}</h1>
            <h2>REPORT UFFICIALE APP FOUNDER</h2>
          </div>
  
          <table>
            <thead>
              <tr>
                <th>DATA</th>
                ${collabHeader}
                <th>LUOGO</th>
                <th>ORARIO</th>
                <th>DURATA</th> <th>PAUSA</th>  <th>STATO</th>  <th>TARIFFA</th>
                <th>IMPORTO</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
  
          <div class="total-box">
            <div class="total-row">ORE TOTALI: <b>${totalHours}</b></div>
            <div class="grand-total">TOTALE: € ${totalAmount}</div>
          </div>
  
          <div class="footer">
            Generato automaticamente dal Sistema Gestionale Founder - ${new Date().toLocaleDateString('it-IT')}
          </div>
        </body>
      </html>
    `;
};

// --- FUNZIONE PRINCIPALE EXPORT ---
export const generatePDF = async (docTitle, shifts, reportType) => {
    try {
        let grandTotal = 0;
        let totalMinutesWorked = 0;

        // Calcoliamo i totali
        shifts.forEach(s => {
            const { cost, minutes } = calculateFiscalData(s);
            grandTotal += parseFloat(cost);
            totalMinutesWorked += minutes;
        });

        // Creiamo l'HTML passando i dati
        const html = createHTML(docTitle, shifts, grandTotal.toFixed(2), formatDuration(totalMinutesWorked), reportType);

        // === BIVIO WEB vs MOBILE ===
        if (Platform.OS === 'web') {
            const printWindow = window.open('', '_blank', 'width=800,height=600');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close(); 
                printWindow.focus();
                setTimeout(() => { printWindow.print(); }, 500);
            } else {
                Alert.alert("Attenzione", "Sblocca i popup per stampare.");
            }
        } else {
            const { uri } = await Print.printToFileAsync({ html });
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
        
    } catch (error) {
        console.error("PDF Error:", error);
        Alert.alert("Errore PDF", "Impossibile generare il PDF.");
    }
};