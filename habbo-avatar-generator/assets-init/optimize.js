const fs = require('fs');
const path = require('path');

const MAX_ITEMS = 40;
const gamedataPath = path.join(__dirname, '..', 'data', 'nitro-assets', 'gamedata', 'json');
const assetsPath = path.join(__dirname, '..', 'data', 'assets');

console.log(`[Optimizer] Starting... Max items per category: ${MAX_ITEMS}`);

try {
    // 1. Prune FigureData.json
    const fdPath = path.join(gamedataPath, 'FigureData.json');
    if (!fs.existsSync(fdPath)) throw new Error('FigureData.json not found');
    const fd = JSON.parse(fs.readFileSync(fdPath, 'utf8'));

    const keptParts = new Set();
    let totalItemsBefore = 0;
    let totalItemsAfter = 0;

    let stRoot = fd.settype || fd.setType || fd.settypes || fd.setTypes || fd.figuredata?.settype;
    let settypes = stRoot?.settypes || stRoot?.setTypes || stRoot?.settype || stRoot?.setType || stRoot;

    if (!Array.isArray(settypes)) {
        if (typeof settypes === 'object') settypes = Object.values(settypes);
        else settypes = [];
    }

    for (const st of settypes) {
        let sets = st.sets || st.set || st.figureparts || st.figureParts;
        if (!sets) continue;

        const isArray = Array.isArray(sets);
        const setsArray = isArray ? sets : Object.values(sets);

        const selectable = [];
        const nonSelectable = [];

        for (const s of setsArray) {
            totalItemsBefore++;
            const isSel = (s.selectable == 1 || s.selectable === true || s.isSelectable == 1 || s.isSelectable === true);
            if (isSel) selectable.push(s);
            else nonSelectable.push(s);
        }

        selectable.sort((a, b) => parseInt(a.id || a.setId || 0) - parseInt(b.id || b.setId || 0));
        const keptSelectable = selectable.slice(0, MAX_ITEMS);

        const newSetsArray = [...nonSelectable, ...keptSelectable];

        // Reconstruct correctly
        if (isArray) {
            if (st.sets) st.sets = newSetsArray;
            else if (st.set) st.set = newSetsArray;
            else if (st.figureparts) st.figureparts = newSetsArray;
        } else {
            const newObj = {};
            for (const s of newSetsArray) {
                newObj[s.id || s.setId] = s;
            }
            if (st.sets) st.sets = newObj;
            else if (st.set) st.set = newObj;
            else if (st.figureparts) st.figureparts = newObj;
        }

        for (const s of newSetsArray) {
            totalItemsAfter++;
            let parts = s.parts || s.part || s.figurepart || [];
            if (!Array.isArray(parts)) parts = [parts];
            for (const p of parts) {
                if (p.type && p.id) {
                    keptParts.add(`${p.type}-${p.id}`);
                }
            }
        }
    }

    fs.writeFileSync(fdPath, JSON.stringify(fd));
    console.log(`[Optimizer] Pruned FigureData. Items: ${totalItemsBefore} -> ${totalItemsAfter}.`);

    // 2. Prune FigureMap.json
    const fmPath = path.join(gamedataPath, 'FigureMap.json');
    const fm = JSON.parse(fs.readFileSync(fmPath, 'utf8'));
    const safeLibs = new Set();

    if (fm.libraries) {
        let libsBefore = fm.libraries.length;
        const newLibs = [];
        for (const lib of fm.libraries) {
            let isUsed = false;
            let parts = lib.parts || lib.part || [];
            if (!Array.isArray(parts)) parts = [parts];

            if (parts.length === 0) {
                isUsed = true;
            } else {
                for (const p of parts) {
                    if (keptParts.has(`${p.type}-${p.id}`)) {
                        isUsed = true;
                        break;
                    }
                }
            }
            if (isUsed) {
                newLibs.push(lib);
                safeLibs.add(lib.id);
            }
        }
        fm.libraries = newLibs;
        fs.writeFileSync(fmPath, JSON.stringify(fm));
        console.log(`[Optimizer] Pruned FigureMap libraries: ${libsBefore} -> ${fm.libraries.length}.`);
    }

    // 3. Keep Effects from EffectMap.json
    const emPath = path.join(gamedataPath, 'EffectMap.json');
    if (fs.existsSync(emPath)) {
        const em = JSON.parse(fs.readFileSync(emPath, 'utf8'));
        if (em.effects && Array.isArray(em.effects)) {
            em.effects.forEach(eff => safeLibs.add(eff.lib));
        }
    }

    const alwaysKeep = ['hh_human_body', 'hh_human_item', 'hh_human_fx', 'hh_human_face'];
    alwaysKeep.forEach(lib => safeLibs.add(lib));

    // 4. Delete unused .nitro files
    if (fs.existsSync(assetsPath)) {
        const files = fs.readdirSync(assetsPath);
        let deleted = 0;
        let skipped = 0;
        for (const file of files) {
            if (file.endsWith('.nitro')) {
                const basename = file.replace('.nitro', '');
                if (!safeLibs.has(basename) && !basename.startsWith('hh_human')) {
                    fs.unlinkSync(path.join(assetsPath, file));
                    deleted++;
                } else {
                    skipped++;
                }
            }
        }
        console.log(`[Optimizer] Deleted ${deleted} unused .nitro files. Kept ${skipped} files.`);
    }

    console.log(`[Optimizer] Finished successfully.`);

} catch (err) {
    console.error(`[Optimizer] FATAL ERROR:`, err);
    process.exit(1);
}
