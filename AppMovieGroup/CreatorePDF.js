//CreatorePDF.js
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import { calculateFiscalData } from './CalcolatriceFiscale'; // <--- IMPORT FONDAMENTALE

// Helper per formattare la durata (solo estetica per il PDF)
const formatDuration = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
};

// --- GENERA HTML ---
const createHTML = (docTitle, shifts, totalAmount, totalHours, isGlobalReport) => {
    const rows = shifts.map(shift => {
        // USIAMO LA CALCOLATRICE ESTERNA
        const { cost, minutes } = calculateFiscalData(shift);
        
        let rateLabel = '';
        if (shift.rateType === 'minute') rateLabel = `€${shift.payoutRate}/min`;
        else if (shift.rateType === 'daily') rateLabel = `€${shift.payoutRate} (Fisso)`;
        else rateLabel = `€${shift.payoutRate}/h`;

        const collabCell = isGlobalReport ? `<td style="font-weight:bold; color:#000;">${shift.collaboratorName}</td>` : '';

        return `
        <tr class="item-row">
            <td style="width:12%">${shift.date}</td>
            ${collabCell}
            <td style="width:25%"><b>${shift.location}</b></td>
            <td style="width:15%">${shift.startTime} - ${shift.endTime}</td>
            <td style="width:12%; color:#555;">${formatDuration(minutes)}</td>
            <td style="width:12%; font-size:10px; color:#777;">${rateLabel}</td>
            <td style="width:10%; text-align: right; font-weight: bold;">€ ${cost}</td>
        </tr>
        `;
    }).join('');

    const collabHeader = isGlobalReport ? `<th style="text-align:left;">COLLABORATORE</th>` : '';

    return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: 'Helvetica', sans-serif; padding: 30px; color: #333; }
          .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #4CAF50; }
          .logo { font-size: 28px; font-weight: 900; letter-spacing: 2px; color: #000; }
          .sub-logo { color: #4CAF50; font-size: 14px; text-transform: uppercase; margin-top: 5px; font-weight: bold; }
          .meta-container { display: flex; justify-content: space-between; margin-bottom: 30px; background-color: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; }
          .meta-box strong { display: block; font-size: 10px; color: #888; text-transform: uppercase; margin-bottom: 3px; }
          .meta-box span { font-size: 16px; font-weight: bold; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #333; color: #FFF; padding: 12px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
          td { padding: 12px 8px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: middle; }
          .item-row:nth-child(even) { background-color: #fcfcfc; }
          .summary-section { margin-top: 40px; display: flex; justify-content: flex-end; }
          .total-card { background-color: #4CAF50; color: white; padding: 20px; border-radius: 8px; width: 250px; }
          .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .total-big { font-size: 26px; font-weight: bold; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 10px; margin-top: 10px; text-align: right; }
          .footer { margin-top: 60px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">MOVIE GROUP</div>
          <div class="sub-logo">Report Ufficiale Turni</div>
        </div>
        <div class="meta-container">
          <div class="meta-box"><strong>Intestatario</strong><span>${docTitle}</span></div>
          <div class="meta-box"><strong>Data Emissione</strong><span>${new Date().toLocaleDateString('it-IT')}</span></div>
          <div class="meta-box"><strong>Totale Turni</strong><span>${shifts.length}</span></div>
        </div>
        <table>
          <thead>
            <tr><th>Data</th>${collabHeader}<th>Luogo</th><th>Orario</th><th>Durata</th><th>Tariffa</th><th style="text-align: right;">Importo</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="summary-section">
            <div class="total-card">
                <div class="total-row"><span>Ore Totali:</span><strong>${totalHours}</strong></div>
                <div class="total-big">€ ${totalAmount}</div>
            </div>
        </div>
        <div class="footer">Documento generato automaticamente da Movie Group.</div>
      </body>
    </html>
    `;
};

// --- FUNZIONE EXPORT ---
// --- FUNZIONE EXPORT (FIX "VANILLA" PER WEB) ---
export const generatePDF = async (docTitle, shifts, isGlobalReport = false) => {
    try {
        let grandTotal = 0;
        let totalMinutesWorked = 0;

        shifts.forEach(s => {
            const { cost, minutes } = calculateFiscalData(s);
            grandTotal += parseFloat(cost);
            totalMinutesWorked += minutes;
        });

        const html = createHTML(docTitle, shifts, grandTotal.toFixed(2), formatDuration(totalMinutesWorked), isGlobalReport);

        // === BIVIO BLINDATO ===
        if (Platform.OS === 'web') {
            // SU PC (WEB): Metodo Manuale "Nuova Finestra"
            // 1. Apriamo una finestra vuota
            const printWindow = window.open('', '_blank', 'width=800,height=600');
            
            if (printWindow) {
                // 2. Scriviamo dentro l'HTML del report
                printWindow.document.write(html);
                printWindow.document.close(); // Importante: dice al browser "ho finito di scrivere"
                printWindow.focus();
                
                // 3. Aspettiamo mezzo secondo (per caricare eventuali stili) e lanciamo la stampa
                setTimeout(() => {
                    printWindow.print();
                    // printWindow.close(); // Se vuoi che si chiuda da sola dopo la stampa, togli il commento
                }, 500);
            } else {
                alert("Attenzione: Il browser ha bloccato il Pop-up. Autorizzalo in alto a destra!");
            }
        } else {
            // SU APP (MOBILE): Metodo Classico
            const { uri } = await Print.printToFileAsync({ html });
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
        
    } catch (error) {
        console.error("PDF Error:", error);
        Alert.alert("Errore", error.message);
    }
};
