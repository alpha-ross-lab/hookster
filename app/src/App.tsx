// ПРОЕКТ: Hookster (хакатон Solana) — app/App.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Modal, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as api from './src/api';
import { t } from './src/i18n';
import { connectWallet, payTreasury } from './src/wallet';

type Screen = 'home' | 'results' | 'detail';
const short = (a: string) => a.slice(0, 4) + '…' + a.slice(-4);
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n));
const sol = (l: number) => String(l / 1e9);

function Btn({ label, onPress, disabled, kind }: { label: string; onPress: () => void; disabled?: boolean; kind?: 'ghost' }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.btn, kind === 'ghost' && s.ghost, disabled && { opacity: 0.5 }]}>
      <Text style={[s.btnText, kind === 'ghost' && { color: C.accent }]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [cfg, setCfg] = useState<api.Cfg | null>(null);
  const [addr, setAddr] = useState('');
  const [hooks, setHooks] = useState(0);
  const [niche, setNiche] = useState('');
  const [screen, setScreen] = useState<Screen>('home');
  const [items, setItems] = useState<api.Short[]>([]);
  const [canInvent, setCanInvent] = useState(false);
  const [sel, setSel] = useState<api.Short | null>(null);
  const [analysis, setAnalysis] = useState<api.Analysis | null>(null);
  const [seconds, setSeconds] = useState('30');
  const [ideaList, setIdeaList] = useState<api.Idea[]>([]);
  const [scr, setScr] = useState<{ idea: api.Idea; script: api.Script } | null>(null);
  const [busy, setBusy] = useState('');
  const [shop, setShop] = useState(false);
  const [pendingSig, setPendingSig] = useState<{ pack: string; sig: string } | null>(null);

  const fail = (e: any) => {
    if (e?.status === 402 && e.body?.need) Alert.alert(t.notEnough, `${e.body.need} ${t.hooks}`, [{ text: t.buy, onPress: () => setShop(true) }, { text: 'OK' }]);
    else Alert.alert(t.error, String(e?.message || e));
  };

  useEffect(() => {
    (async () => {
      try { setCfg(await api.getConfig()); } catch (e) { fail(e); }
      try {
        const [a, n] = await Promise.all([AsyncStorage.getItem('addr'), AsyncStorage.getItem('niche')]);
        if (n) setNiche(n);
        if (a) { setAddr(a); api.setWallet(a); setHooks((await api.getMe()).hooks); }
      } catch { /* first launch */ }
    })();
  }, []);

  const connect = async () => {
    if (!cfg) return;
    setBusy(t.connecting);
    try {
      const { address } = await connectWallet(cfg.cluster);
      api.setWallet(address); setAddr(address);
      await AsyncStorage.setItem('addr', address);
      setHooks((await api.getMe()).hooks);
    } catch (e) { fail(e); } finally { setBusy(''); }
  };
  const signOut = async () => { await AsyncStorage.removeItem('addr'); setAddr(''); api.setWallet(''); setScreen('home'); };

  const doSearch = useCallback(async (more: boolean) => {
    setBusy(t.searching);
    try {
      await AsyncStorage.setItem('niche', niche);
      const r = await api.search(niche, more ? items.map((i) => i.id) : []);
      setHooks(r.hooks); setCanInvent(!!r.canInvent);
      setItems(more ? [...items, ...r.items] : r.items); setScreen('results');
    } catch (e) { fail(e); } finally { setBusy(''); }
  }, [niche, items]);

  const openVideo = async (v: api.Short) => {
    setBusy(t.analyzing);
    try {
      const r = await api.analyze(v.id, niche);
      setSel(r.video); setAnalysis(r.analysis); setHooks(r.hooks); setIdeaList([]); setScr(null); setScreen('detail');
    } catch (e) { fail(e); } finally { setBusy(''); }
  };
  const secs = () => Math.max(10, Math.min(300, parseInt(seconds, 10) || 30));
  const getIdeas = async (invent: boolean) => {
    setBusy(t.writing);
    try {
      const r = await api.ideas({ niche, seconds: secs(), videoId: invent ? 'invent' : sel!.id, analysis: invent ? undefined : analysis!, avoid: ideaList.map((i) => i.title) });
      setIdeaList(r.ideas); setHooks(r.hooks); setScr(null);
      if (invent) { setSel(null); setAnalysis(null); setScreen('detail'); }
    } catch (e) { fail(e); } finally { setBusy(''); }
  };
  const getScript = async (idea: api.Idea) => {
    setBusy(t.writing);
    try { const r = await api.script({ niche, seconds: secs(), idea }); setScr({ idea, script: r.script }); setHooks(r.hooks); }
    catch (e) { fail(e); } finally { setBusy(''); }
  };

  const buy = async (p: api.Pack) => {
    if (!cfg) return;
    try {
      setBusy(t.paying);
      const sig = await payTreasury({ cluster: cfg.cluster, rpc: cfg.rpc, from: addr, to: cfg.treasury, lamports: p.lamports, onStep: setBusy });
      setPendingSig({ pack: p.id, sig });
      await verify(p.id, sig);
    } catch (e) { fail(e); setBusy(''); }
  };
  const verify = async (packId: string, sig: string) => {
    setBusy(t.confirming);
    try {
      for (let i = 0; i < 6; i++) {
        try {
          const r = await api.verifyBuy(packId, sig);
          setHooks(r.hooks); setPendingSig(null); setShop(false); Alert.alert(t.bought, `+${r.added}`); return;
        } catch (e: any) {
          if (!e?.body?.pending) throw e;
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
      Alert.alert(t.error, t.pending);
    } catch (e) { fail(e); } finally { setBusy(''); }
  };

  const copy = async (text: string) => { await Clipboard.setStringAsync(text); Alert.alert(t.copied); };
  const scriptText = (x: api.Script) =>
    `${x.hook}\n\n${x.beats.map((b) => `${b.time}\n${b.visual}${b.voice ? `\n“${b.voice}”` : ''}`).join('\n\n')}\n\n${x.caption}\n${x.hashtags.join(' ')}`;

  // ---------- UI ----------
  const header = (
    <View style={s.header}>
      <Text style={s.logo}>🎣 Hookster</Text>
      {addr ? (
        <Pressable onPress={() => setShop(true)} style={s.chip}>
          <Text style={s.chipText}>{hooks} {t.hooks} · {short(addr)}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (!addr) {
    body = (
      <View style={s.center}>
        <Text style={s.h1}>{t.tagline}</Text>
        <Text style={s.muted}>{t.connectHint}</Text>
        <View style={{ height: 20 }} />
        <Btn label={t.connect} onPress={connect} disabled={!cfg || !!busy} />
        {cfg ? <Text style={[s.muted, { marginTop: 12 }]}>🎁 {cfg.freeHooks} {t.hooks} {t.free}</Text> : null}
      </View>
    );
  } else if (screen === 'home') {
    body = (
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.label}>{t.niche}</Text>
        <TextInput style={[s.input, { height: 110 }]} multiline value={niche} onChangeText={setNiche} placeholder={t.nichePh} placeholderTextColor={C.muted} />
        <Btn label={`${t.find} · ${cfg?.cost.search ?? ''} ${t.hooks}`} onPress={() => doSearch(false)} disabled={niche.trim().length < 10 || !!busy} />
        <View style={{ height: 10 }} />
        <Btn kind="ghost" label={t.invent} onPress={() => { setSel(null); setAnalysis(null); setIdeaList([]); setScr(null); setScreen('detail'); }} disabled={niche.trim().length < 10} />
        <View style={{ height: 20 }} />
        <Btn kind="ghost" label={t.disconnect} onPress={signOut} />
      </ScrollView>
    );
  } else if (screen === 'results') {
    body = (
      <ScrollView contentContainerStyle={s.pad}>
        <Btn kind="ghost" label={'← ' + t.back} onPress={() => setScreen('home')} />
        {items.length === 0 ? <Text style={[s.muted, { marginVertical: 16 }]}>{t.noResults}</Text> : null}
        {items.map((v) => (
          <View key={v.id} style={s.card}>
            {v.thumb ? <Image source={{ uri: v.thumb }} style={s.thumb} /> : null}
            <Text style={s.ratio}>{v.ratio}{t.times}</Text>
            <Text style={s.cardTitle}>{v.title}</Text>
            <Text style={s.muted}>{v.channel} · {fmt(v.views)} {t.views} · {v.seconds}s</Text>
            <View style={{ height: 8 }} />
            <Btn label={`${t.analyze} · ${cfg?.cost.analyze ?? ''}`} onPress={() => openVideo(v)} disabled={!!busy} />
            <Pressable onPress={() => Linking.openURL(v.url)}><Text style={[s.link, { marginTop: 8 }]}>{t.open}</Text></Pressable>
          </View>
        ))}
        {items.length > 0 ? <Btn kind="ghost" label={`${t.more} · ${cfg?.cost.searchMore ?? ''}`} onPress={() => doSearch(true)} disabled={!!busy} /> : null}
        <View style={{ height: 10 }} />
        <Btn kind="ghost" label={t.invent} onPress={() => { setSel(null); setAnalysis(null); setIdeaList([]); setScr(null); setScreen('detail'); }} />
      </ScrollView>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={s.pad}>
        <Btn kind="ghost" label={'← ' + t.back} onPress={() => setScreen(items.length ? 'results' : 'home')} />
        {sel && analysis ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>{sel.title}</Text>
            <Text style={s.sec}>{t.hook}</Text><Text style={s.body}>{analysis.hook}</Text>
            <Text style={s.sec}>{t.format}</Text><Text style={s.body}>{analysis.format}</Text>
            <Text style={s.sec}>{t.structure}</Text>
            {analysis.structure.map((x, i) => <Text key={i} style={s.body}>{i + 1}. <Text style={{ fontWeight: '700' }}>{x.name}</Text> — {x.text}</Text>)}
            <Text style={s.sec}>{t.why}</Text>
            {analysis.why.map((x, i) => <Text key={i} style={s.body}>• {x}</Text>)}
          </View>
        ) : null}
        <Text style={s.label}>{t.length}</Text>
        <TextInput style={s.input} keyboardType="number-pad" value={seconds} onChangeText={setSeconds} />
        {ideaList.length === 0 ? (
          <Btn label={t.makeIdeas + (sel ? ` · ${t.free}` : ` · ${cfg?.cost.invent ?? ''}`)} onPress={() => getIdeas(!sel)} disabled={!!busy} />
        ) : (
          <>
            <Text style={s.h2}>{t.ideas}</Text>
            {ideaList.map((idea, i) => (
              <View key={i} style={s.card}>
                <Text style={s.cardTitle}>{idea.title}</Text>
                <Text style={s.body}>{idea.description}</Text>
                {idea.why ? <Text style={s.muted}>{idea.why}</Text> : null}
                <View style={{ height: 8 }} />
                <Btn label={`${t.script} · ${cfg?.cost.script ?? ''}`} onPress={() => getScript(idea)} disabled={!!busy} />
              </View>
            ))}
            <Btn kind="ghost" label={`${t.reroll} · ${cfg?.cost.ideasReroll ?? ''}`} onPress={() => getIdeas(!sel)} disabled={!!busy} />
          </>
        )}
        {scr ? (
          <View style={[s.card, { borderColor: C.accent }]}>
            <Text style={s.h2}>{t.script}</Text>
            <Text style={s.cardTitle}>{scr.script.hook}</Text>
            <Text style={s.sec}>{t.beats}</Text>
            {scr.script.beats.map((b, i) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <Text style={s.ratio}>{b.time}</Text>
                <Text style={s.body}>{b.visual}</Text>
                {b.voice ? <Text style={[s.body, { fontStyle: 'italic' }]}>“{b.voice}”</Text> : null}
              </View>
            ))}
            <Text style={s.sec}>{t.caption}</Text>
            <Text style={s.body}>{scr.script.caption}</Text>
            <Text style={s.muted}>{scr.script.hashtags.join(' ')}</Text>
            <View style={{ height: 8 }} />
            <Btn label={t.copy} onPress={() => copy(scriptText(scr.script))} />
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" />
      {header}
      {body}
      {busy ? <View style={s.overlay}><ActivityIndicator color={C.accent} size="large" /><Text style={s.body}>{busy}</Text></View> : null}
      <Modal visible={shop} transparent animationType="slide" onRequestClose={() => setShop(false)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <Text style={s.h2}>{t.packs}</Text>
            {cfg?.packs.map((p) => (
              <Pressable key={p.id} style={s.pack} onPress={() => buy(p)} disabled={!!busy}>
                <Text style={s.cardTitle}>{p.hooks} {t.hooks}</Text>
                <Text style={s.ratio}>{sol(p.lamports)} SOL</Text>
              </Pressable>
            ))}
            {pendingSig ? <Btn label={t.recheck} onPress={() => verify(pendingSig.pack, pendingSig.sig)} disabled={!!busy} /> : null}
            <View style={{ height: 8 }} />
            <Btn kind="ghost" label={t.back} onPress={() => setShop(false)} />
            {busy ? <ActivityIndicator color={C.accent} style={{ marginTop: 8 }} /> : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const C = { bg: '#0E0E12', card: '#1A1A22', line: '#2A2A36', text: '#F2F2F7', muted: '#9A9AAE', accent: '#9945FF' };
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 36 },
  logo: { color: C.text, fontSize: 22, fontWeight: '800' },
  chip: { backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.line },
  chipText: { color: C.text, fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  pad: { padding: 16, paddingBottom: 60, gap: 10 },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  h2: { color: C.text, fontSize: 20, fontWeight: '700', marginTop: 8 },
  label: { color: C.muted, fontSize: 13, marginTop: 6 },
  muted: { color: C.muted, fontSize: 13 },
  body: { color: C.text, fontSize: 15, lineHeight: 21 },
  sec: { color: C.accent, fontWeight: '700', marginTop: 10, marginBottom: 2 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line, fontSize: 16, textAlignVertical: 'top' },
  btn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.accent },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, gap: 4 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  ratio: { color: '#14F195', fontWeight: '700', fontSize: 13 },
  thumb: { width: '100%', height: 160, borderRadius: 10, marginBottom: 6, backgroundColor: C.line },
  link: { color: C.accent, textAlign: 'center' },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000A', justifyContent: 'center', alignItems: 'center', gap: 10 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' },
  modal: { backgroundColor: C.bg, padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 8 },
  pack: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.line },
});
