import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Overlay } from "./ui";

function download(href: string, filename: string) {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
}

/** QR codes are generated in the browser; UTM presets are appended before encoding. */
export function QrDialog({ slug, shortUrl, onClose }: { slug: string; shortUrl: string; onClose: () => void }) {
    const [utm, setUtm] = useState({ utm_source: "qr", utm_medium: "print", utm_campaign: "" });
    const [useUtm, setUseUtm] = useState(true);
    const [png, setPng] = useState<string | null>(null);

    const url = useMemo(() => {
        if (!useUtm) return shortUrl;
        const target = new URL(shortUrl);
        for (const [key, value] of Object.entries(utm)) if (value.trim()) target.searchParams.set(key, value.trim());
        return target.toString();
    }, [shortUrl, utm, useUtm]);

    useEffect(() => {
        let cancelled = false;
        QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" })
            .then((data) => !cancelled && setPng(data))
            .catch(() => !cancelled && setPng(null));
        return () => {
            cancelled = true;
        };
    }, [url]);

    const downloadSvg = async () => {
        const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
        const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        download(blobUrl, `${slug}-qr.svg`);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    };

    return (
        <Overlay onClose={onClose} center label={`QR code for ${slug}`}>
            <div className="page-head">
                <h1>QR code</h1>
                <button type="button" onClick={onClose}>Close</button>
            </div>
            {png ? <img className="qr" src={png} alt={`QR code for ${url}`} /> : <div className="qr" />}
            <code style={{ wordBreak: "break-all", textAlign: "center" }}>{url}</code>
            <label className="check">
                <input type="checkbox" checked={useUtm} onChange={(e) => setUseUtm(e.target.checked)} />
                <span>Add UTM parameters<small>Scans show up in this link's UTM campaign table. The link must forward query parameters for them to reach the destination too.</small></span>
            </label>
            {useUtm && (
                <div className="grid three">
                    {(["utm_source", "utm_medium", "utm_campaign"] as const).map((key) => (
                        <label className="field" key={key}>
                            <span>{key}</span>
                            <input value={utm[key]} onChange={(e) => setUtm((prev) => ({ ...prev, [key]: e.target.value }))} />
                        </label>
                    ))}
                </div>
            )}
            <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" onClick={() => png && download(png, `${slug}-qr.png`)} disabled={!png}>Download PNG</button>
                <button type="button" className="primary" onClick={downloadSvg}>Download SVG</button>
            </div>
        </Overlay>
    );
}
