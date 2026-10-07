#!/usr/bin/env python3
"""Serve the visual lab at 127.0.0.1:8766 with strictly in-memory game storage."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import os
import argparse
BASELINE=None
ROOT=Path(__file__).resolve().parent.parent
ISOLATE=b'''<script>(function(){var m=new Map(),store={getItem:function(k){return m.has(String(k))?m.get(String(k)):null},setItem:function(k,v){m.set(String(k),String(v))},removeItem:function(k){m.delete(String(k))},clear:function(){m.clear()},key:function(i){return Array.from(m.keys())[i]||null},get length(){return m.size}};try{if(parent!==window&&parent.labStorage)store=parent.labStorage}catch(e){}Object.defineProperty(window,'localStorage',{value:store});window.APH_LAB_STORAGE=true;})();</script>'''
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        route=urlsplit(self.path).path
        if route in ['/tests/isolated-game.html','/tests/baseline-game.html']:
            source=BASELINE if route.endswith('baseline-game.html') else ROOT/'game.html'
            if source is None or not source.is_file():self.send_error(404,'Baseline bundle not configured');return
            data=source.read_bytes().replace(b'<head>',b'<head>'+ISOLATE,1)
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)))
            self.end_headers();self.wfile.write(data)
        else: super().do_GET()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--baseline',type=Path);args=parser.parse_args();BASELINE=args.baseline
    os.chdir(ROOT)
    print('Visual lab: http://127.0.0.1:8766/tests/visual_lab.html',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8766),Handler).serve_forever()
