import React, { useState, useEffect } from 'react'; // PayrollScreen.js
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, StatusBar, Platform, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db } from './firebaseConfig';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

const Colors = {
    background: '#0D1117',
    surface: '#161B22',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentGreen: '#238636',
    accentRed: '#DA3633',
    accentGold: '#EAB308',
    divider: '#30363D',
};

export default function PayrollScreen({ navigation, onBack }) {
    const [completedShifts, setCompletedShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalToPay, setTotalToPay] = useState(0);

    // Carica i turni che sono COMPLETATI ma NON ANCORA PAGATI
    const fetchPayroll = async () => {
        setLoading(true);
        try {
            // 1. SCARICHIAMO SOLO I TURNI COMPLETATI (Query Semplice = NESSUN INDICE RICHIESTO)
            const q = query(
                collection(db, "shifts"),
                where("status", "==", "completato")
            );

            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 2. FILTRIAMO IN LOCALE QUELLI NON PAGATI
            // (Funziona anche se il campo isPaid non esiste nel database)
            const unpaidShifts = data.filter(shift => shift.isPaid !== true);

            // Calcola il totale
            const total = unpaidShifts.reduce((sum, shift) => sum + (parseFloat(shift.payoutRate) || 0), 0);
            setTotalToPay(total);

            // Ordina per collaboratore
            unpaidShifts.sort((a, b) => (a.collaboratorName || '').localeCompare(b.collaboratorName || ''));

            setCompletedShifts(unpaidShifts);
        } catch (error) {
            console.error("Errore Payroll:", error);
            Alert.alert("Errore", "Impossibile caricare i dati.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPayroll();
    }, []);

    // Segna come PAGATO
    const handleMarkAsPaid = async (shift) => {
        Alert.alert(
            "Conferma Pagamento",
            `Vuoi segnare il turno di ${shift.collaboratorName} (€${shift.payoutRate}) come SALDATO?`,
            [
                { text: "Annulla", style: "cancel" },
                {
                    text: "Sì, Saldato",
                    onPress: async () => {
                        try {
                            await updateDoc(doc(db, "shifts", shift.id), {
                                isPaid: true,
                                paidAt: new Date().toISOString()
                            });
                            // Rimuovi dalla lista locale immediatamente
                            setCompletedShifts(prev => prev.filter(s => s.id !== shift.id));
                            setTotalToPay(prev => prev - (parseFloat(shift.payoutRate) || 0));
                            Alert.alert("Fatto", "Pagamento registrato.");
                        } catch (e) {
                            Alert.alert("Errore", "Impossibile aggiornare il database.");
                        }
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View>
                    <Text style={styles.nameText}>{item.collaboratorName}</Text>
                    <Text style={styles.subText}>{item.location} • {item.date}</Text>
                </View>
                <View style={styles.priceTag}>
                    <Text style={styles.priceText}>€ {item.payoutRate}</Text>
                </View>
            </View>

            <View style={styles.row}>
                <Text style={styles.timeLabel}>Orario:</Text>
                <Text style={styles.timeValue}>{item.startTime} - {item.endTime}</Text>
            </View>

            <TouchableOpacity
                style={styles.payButton}
                onPress={() => handleMarkAsPaid(item)}
            >
                <Feather name="check-circle" size={18} color="#FFF" style={{marginRight: 8}} />
                <Text style={styles.payButtonText}>SEGNA COME PAGATO</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Buste Paga (Da Saldare)</Text>
            </View>

            <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>TOTALE DA VERSARE</Text>
                <Text style={styles.totalValue}>€ {totalToPay.toFixed(2)}</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={Colors.accentGreen} style={{marginTop: 50}} />
            ) : (
                <FlatList
                    data={completedShifts}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 20 }}
                    ListEmptyComponent={
                        <View style={{alignItems:'center', marginTop: 50}}>
                            <Feather name="smile" size={50} color={Colors.textSecondary} />
                            <Text style={styles.empty}>Nessun pagamento in sospeso.</Text>
                            <Text style={{color: Colors.textSecondary, fontSize: 12}}>Per vedere dati qui, devi prima completare un turno.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    backBtn: { marginRight: 15 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
    totalBox: { backgroundColor: Colors.surface, padding: 20, margin: 20, marginBottom: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.accentGold },
    totalLabel: { color: Colors.accentGold, fontWeight: 'bold', letterSpacing: 1, marginBottom: 5 },
    totalValue: { color: Colors.textPrimary, fontSize: 32, fontWeight: 'bold' },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: Colors.divider },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
    nameText: { color: Colors.textPrimary, fontSize: 18, fontWeight: 'bold' },
    subText: { color: Colors.textSecondary, fontSize: 14 },
    priceTag: { backgroundColor: Colors.accentGreen + '20', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: Colors.accentGreen },
    priceText: { color: Colors.accentGreen, fontWeight: 'bold', fontSize: 16 },
    row: { flexDirection: 'row', marginBottom: 15 },
    timeLabel: { color: Colors.textSecondary, marginRight: 10 },
    timeValue: { color: Colors.textPrimary, fontWeight: 'bold' },
    payButton: { backgroundColor: Colors.accentGreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8 },
    payButtonText: { color: '#FFF', fontWeight: 'bold' },
    empty: { color: Colors.textSecondary, fontSize: 16, marginTop: 10, marginBottom: 5 }
});
