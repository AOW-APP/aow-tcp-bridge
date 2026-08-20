import { createGunzip } from 'node:zlib';
import { createReadStream, existsSync, unlinkSync } from 'node:fs';
import readline from 'node:readline';
import { supabase } from '../supabase.ts';

// Configurable country filtering via allowed Mobile Country Codes
const ALLOWED_MCCS = new Set(
  (Bun.env.ALLOWED_MCCS || '214').split(',').map(s => parseInt(s.trim(), 10))
);

const OPENCELLID_API_KEY = Bun.env.OPENCELLID_API_KEY || '';
const BATCH_SIZE = 1000;

async function run() {
  console.log(`[Importer] Starting OpenCellID data import process...`);
  console.log(`[Importer] Filtering for Mobile Country Codes (MCC):`, Array.from(ALLOWED_MCCS));

  if (!OPENCELLID_API_KEY) {
    console.error(`[Importer] Error: OPENCELLID_API_KEY is not defined in .env.`);
    process.exit(1);
  }

  // Iterate over each MCC to download and import country-specific datasets (much faster and lighter)
  for (const mcc of ALLOWED_MCCS) {
    const filename = `${mcc}.csv.gz`;
    const localFilePath = `./${filename}`;
    const downloadUrl = `https://opencellid.org/ocid/downloads?token=${OPENCELLID_API_KEY}&type=mcc&file=${filename}`;

    console.log(`\n--------------------------------------------`);
    console.log(`[Importer] Processing MCC ${mcc} (${filename})...`);

    // 1. Download country-specific file
    if (!existsSync(localFilePath)) {
      console.log(`[Importer] Downloading dataset for MCC ${mcc}...`);
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }
        
        // Peek at content to see if it is a JSON error
        const blob = await response.blob();
        const textPeek = await blob.slice(0, 100).text();
        if (textPeek.startsWith('{"status":"error"')) {
          const errorMsg = JSON.parse(textPeek).message || 'Unknown API Error';
          throw new Error(`OpenCellID API Error: ${errorMsg}`);
        }

        await Bun.write(localFilePath, blob);
        console.log(`[Importer] Download complete. Saved to ${localFilePath}`);
      } catch (err: any) {
        console.error(`[Importer] Failed to download MCC ${mcc}:`, err.message);
        continue;
      }
    } else {
      console.log(`[Importer] Using existing local file: ${localFilePath}`);
    }

    // 2. Stream, unzip, and parse line-by-line
    console.log(`[Importer] Reading and parsing CSV stream...`);
    
    try {
      const gunzip = createGunzip();
      const fileStream = createReadStream(localFilePath);
      
      const rl = readline.createInterface({
        input: fileStream.pipe(gunzip),
        crlfDelay: Infinity
      });

      let totalProcessed = 0;
      let totalMatched = 0;
      let batch: any[] = [];
      
      // Headers: radio,mcc,net,area,cell,unit,lon,lat,range,samples,changeable,created,updated,averageSignal
      for await (const line of rl) {
        totalProcessed++;
        if (totalProcessed === 1) continue; // Skip header row

        const cols = line.split(',');
        if (cols.length < 10) continue;

        const rowMcc = parseInt(cols[1], 10);
        const mnc = parseInt(cols[2], 10);
        const lac = parseInt(cols[3], 10);
        const cellId = parseInt(cols[4], 10);
        const lon = parseFloat(cols[6]);
        const lat = parseFloat(cols[7]);
        const range = cols[8] ? parseInt(cols[8], 10) : null;
        const samples = cols[9] ? parseInt(cols[9], 10) : null;

        if (isNaN(rowMcc) || isNaN(mnc) || isNaN(lac) || isNaN(cellId) || isNaN(lon) || isNaN(lat)) {
          continue;
        }

        batch.push({
          radio: cols[0],
          mcc: rowMcc,
          mnc,
          lac,
          cell_id: cellId,
          // Use standard Well-Known Text (WKT) string format for PostGIS geography
          location: `POINT(${lon} ${lat})`, 
          range,
          samples,
          updated_at: new Date().toISOString()
        });

        totalMatched++;

        if (batch.length >= BATCH_SIZE) {
          const currentBatch = [...batch];
          batch = [];
          rl.pause(); // Pause stream to prevent memory backpressure
          await upsertBatch(currentBatch);
          rl.resume();
        }
      }

      // Insert remaining items in final batch
      if (batch.length > 0) {
        await upsertBatch(batch);
      }

      console.log(`\n[Importer] MCC ${mcc} completed! Processed lines: ${totalProcessed}, Imported rows: ${totalMatched}`);

    } catch (err: any) {
      console.error(`[Importer] Error parsing file for MCC ${mcc}:`, err.message);
      // Clean up corrupted file if parse failed
      if (existsSync(localFilePath)) {
        try { unlinkSync(localFilePath); } catch {}
      }
    }
  }

  console.log(`\n[Importer] OpenCellID import process completed for all target countries.`);
}

async function upsertBatch(data: any[]) {
  try {
    // Deduplicate the batch in memory to prevent PostgreSQL "cannot affect row a second time" error
    const uniqueMap = new Map<string, any>();
    for (const item of data) {
      const key = `${item.mcc}-${item.mnc}-${item.lac}-${item.cell_id}`;
      uniqueMap.set(key, item); // Keeps the latest entry in the batch
    }
    const deduplicatedData = Array.from(uniqueMap.values());

    const { error } = await supabase
      .from('cell_towers')
      .upsert(deduplicatedData, { onConflict: 'mcc,mnc,lac,cell_id' });

    if (error) throw error;
    process.stdout.write(`.`); // Progress indicator
  } catch (err: any) {
    console.error(`\n[Importer] Error upserting batch:`, err.message);
  }
}

run().catch((err) => {
  console.error('[Importer] Fatal error:', err);
  process.exit(1);
});
