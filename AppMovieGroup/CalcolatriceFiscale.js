// CalcolatriceFiscale.js
// Logica centralizzata per il calcolo dei costi (Doppia Forbice)
export const calculateFiscalData = (shift) => {
    // Se mancano dati essenziali, ritorna zero
    if (!shift || !shift.date || !shift.startTime || !shift.endTime) {
        return { cost: "0.00", minutes: 0 };
    }

    // 1. Costruiamo gli oggetti Date per Previsto Inizio e Previsto Fine
    const [year, month, day] = shift.date.split('-').map(Number);

    const [h1, m1] = shift.startTime.split(':').map(Number);
    const scheduledStart = new Date(year, month - 1, day, h1, m1, 0);

    const [h2, m2] = shift.endTime.split(':').map(Number);
    const scheduledEnd = new Date(year, month - 1, day, h2, m2, 0);

    // Gestione cavallo mezzanotte (es. dalle 23:00 alle 01:00)
    if (scheduledEnd < scheduledStart) {
        scheduledEnd.setDate(scheduledEnd.getDate() + 1);
    }

    // 2. Orari Reali (Fallback se mancano i dati reali: usa i previsti)
    // Se il turno non è ancora iniziato/finito, usiamo i previsti per evitare errori di calcolo
    const realStart = shift.realStartTime ? new Date(shift.realStartTime) : scheduledStart;
    const realEnd = shift.realEndTime ? new Date(shift.realEndTime) : scheduledEnd;

    // 3. LOGICA FORBICE (Il cuore della fiscalità)
    // INIZIO: Il più tardi tra Reale e Previsto (Niente soldi se arrivi prima, penalità se arrivi dopo)
    const effectiveStart = realStart < scheduledStart ? scheduledStart : realStart;

    // FINE: Il più presto tra Reale e Previsto (Niente soldi se resti di più o se il turno chiude in ritardo)
    const effectiveEnd = realEnd < scheduledEnd ? realEnd : scheduledEnd;

    // Sicurezza: Se l'inizio effettivo è dopo la fine effettiva (es. ritardo mostruoso), costo 0
    if (effectiveStart > effectiveEnd) {
        return { cost: "0.00", minutes: 0 };
    }

// Calcolo Minuti Lavorati (SOLO MINUTI INTERI)
    const diffMs = effectiveEnd - effectiveStart;
    // Math.floor taglia via i secondi (es. 10m 59s diventa 10m)
    const minutesWorked = Math.floor(diffMs / 1000 / 60);

    // Calcolo Costo
    const rate = parseFloat(shift.payoutRate || 0);
    let totalCost = 0;

    if (shift.rateType === 'minute') {
        totalCost = minutesWorked * rate;
    } else if (shift.rateType === 'daily') {
        totalCost = rate; // Tariffa fissa, ignora il tempo
    } else {
        // Hourly (Default)
        totalCost = (minutesWorked / 60) * rate;
    }

    return {
        cost: Math.max(0, totalCost).toFixed(2), // Ritorna stringa "10.50"
        minutes: Math.floor(minutesWorked)       // Ritorna intero 90
    };
};
