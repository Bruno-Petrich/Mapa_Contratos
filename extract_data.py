import pandas as pd
import json
import traceback
import random

STATE_COORDS = {
    'AC': (-8.77, -70.55), 'AL': (-9.71, -35.73), 'AM': (-3.47, -65.10),
    'AP': (1.41, -51.77), 'BA': (-12.96, -38.51), 'CE': (-3.71, -38.54),
    'DF': (-15.83, -47.86), 'ES': (-19.19, -40.34), 'GO': (-16.64, -49.31),
    'MA': (-2.55, -44.30), 'MG': (-18.10, -44.38), 'MS': (-20.51, -54.54),
    'MT': (-12.64, -55.42), 'PA': (-5.53, -52.29), 'PB': (-7.06, -35.55),
    'PE': (-8.28, -35.07), 'PI': (-8.28, -43.68), 'PR': (-24.89, -51.55),
    'RJ': (-22.84, -43.15), 'RN': (-5.22, -36.52), 'RO': (-11.22, -62.80),
    'RR': (1.89, -61.22), 'RS': (-30.01, -51.22), 'SC': (-27.33, -49.44),
    'SE': (-10.90, -37.07), 'SP': (-23.55, -46.64), 'TO': (-10.25, -48.25)
}

def load_data():
    file_path = 'CONTRATOS 2025 - REV03 - Online.xlsx'
    df = pd.read_excel(file_path, header=1)
    df.columns = df.columns.astype(str).str.replace('\n', ' ').str.strip()
    return df

def generate_json(df):
    col_local = [c for c in df.columns if 'Local de Inst' in c][0]
    col_modelo = [c for c in df.columns if 'Modelo' in c][0]
    col_contrato = [c for c in df.columns if 'Nº Contrato' in c][0]
    col_cidade = [c for c in df.columns if 'Cidade' in c][0]
    col_uf = [c for c in df.columns if 'UF' in c][0]
    
    col_termino_garantia = [c for c in df.columns if 'Término da Garantia' in c]
    col_termino = col_termino_garantia[0] if col_termino_garantia else None
        
    df = df.dropna(subset=[col_local])
    grouped = {}
    
    for idx, row in df.iterrows():
        local = str(row[col_local]).strip()
        cidade = str(row[col_cidade]).strip().upper() if pd.notna(row[col_cidade]) else 'N/A'
        uf = str(row[col_uf]).strip().upper() if pd.notna(row[col_uf]) else 'N/A'
        modelo = str(row[col_modelo]).strip() if pd.notna(row[col_modelo]) else 'N/A'
        contrato = str(row[col_contrato]).strip() if pd.notna(row[col_contrato]) else 'N/A'
        
        # Parse Warranty Date correctly
        termino = 'N/A'
        if col_termino and pd.notna(row[col_termino]):
            val = row[col_termino]
            if isinstance(val, pd.Timestamp):
                termino = val.strftime('%d/%m/%Y')
            else:
                termino = str(val).split()[0]
                
        if not local or local == 'nan': continue
        if cidade == 'NAN' or cidade == 'N/A': continue # Avoid mapping machines without a valid city

        # MUDANÇA: A chave agora é Cidade + UF
        city_key = f"{cidade} - {uf}"

        if city_key not in grouped:
            lat, lon = -14.235, -51.925
            
            # Mapeamento com jitter por estado para distribuir as cidades randomicamente dentro do estado
            if uf in STATE_COORDS:
                base_lat, base_lon = STATE_COORDS[uf]
                # Aumentamos o jitter (espalhamento) para o nível de cidade para ~ 1.5 a 2 graus.
                # Como agrupamos por cidade, cada cidade terá UMA únia coordenada no estado.
                lat = base_lat + random.uniform(-1.5, 1.5)
                lon = base_lon + random.uniform(-1.5, 1.5)

            grouped[city_key] = {
                "cidade": cidade,
                "uf": uf,
                "lat": lat,
                "lon": lon,
                "equipamentos": []
            }
            
        # Append raw equipament dictionary
        grouped[city_key]["equipamentos"].append({
            "local": local,
            "modelo": modelo,
            "contrato": contrato,
            "termino_garantia": termino
        })
            
    output = list(grouped.values())
    
    with open('dados.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        
    print(f"Sucesso: Extraídas com sucesso {len(output)} Cidades Únicas agregadas.")

if __name__ == "__main__":
    try:
        df = load_data()
        generate_json(df)
    except Exception as e:
        print("Fatal Error:", traceback.format_exc())
