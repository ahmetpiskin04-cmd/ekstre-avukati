import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskSensitiveData, SECRET_TOKEN } from "../privacy-masker";

describe("maskSensitiveData — kart numarası", () => {
  it("boşluklu 16 haneyi son 4 hane kalacak şekilde maskeler", () => {
    const r = maskSensitiveData("Kart No: 5528 7912 3456 1234");
    assert.equal(r.text, "Kart No: **** **** **** 1234");
    assert.equal(r.report.cards, 1);
  });

  it("bitişik ve tireli yazımları maskeler", () => {
    const r = maskSensitiveData("A 4543600299991234 B 4543-6002-9999-5678");
    assert.equal(r.text, "A **** **** **** 1234 B **** **** **** 5678");
    assert.equal(r.report.cards, 2);
  });

  it("bankanın kısmen gizlediği numarayı da standart biçime çeker", () => {
    const r = maskSensitiveData("5528 79** **** 1234");
    assert.equal(r.text, "**** **** **** 1234");
    assert.equal(r.report.cards, 1);
  });

  it("zaten tamamen maskeli numarayı tekrar saymaz", () => {
    const r = maskSensitiveData("**** **** **** 1234");
    assert.equal(r.text, "**** **** **** 1234");
    assert.equal(r.report.cards, 0);
  });

  it("15 veya 17 haneli sayılara dokunmaz", () => {
    const input = "Ref 123456789012345 ve 12345678901234567";
    assert.equal(maskSensitiveData(input).text, input);
  });
});

describe("maskSensitiveData — IBAN", () => {
  it("boşluklu TR IBAN'ı gizler", () => {
    const r = maskSensitiveData("IBAN: TR33 0006 1005 1978 6457 8413 26.");
    assert.equal(r.text, `IBAN: ${SECRET_TOKEN}.`);
    assert.equal(r.report.ibans, 1);
  });

  it("bitişik ve küçük harfli IBAN'ı gizler, içindeki 16 haneyi kart sanmaz", () => {
    const r = maskSensitiveData("Alıcı tr330006100519786457841326 ödeme");
    assert.equal(r.text, `Alıcı ${SECRET_TOKEN} ödeme`);
    assert.equal(r.report.ibans, 1);
    assert.equal(r.report.cards, 0);
  });

  it("eksik haneli TR numarasını IBAN saymaz", () => {
    const r = maskSensitiveData("TR33 0006 1005");
    assert.equal(r.report.ibans, 0);
  });
});

describe("maskSensitiveData — T.C. Kimlik No", () => {
  it("11 haneli kimlik numarasını gizler", () => {
    const r = maskSensitiveData("T.C. Kimlik No;10000000146");
    assert.equal(r.text, `T.C. Kimlik No;${SECRET_TOKEN}`);
    assert.equal(r.report.nationalIds, 1);
  });

  it("0 ile başlayan 11 haneli telefon numarasına dokunmaz", () => {
    const r = maskSensitiveData("Tel 05321234567");
    assert.equal(r.text, "Tel 05321234567");
    assert.equal(r.report.nationalIds, 0);
  });

  it("tarih ve tutarlara dokunmaz", () => {
    const input = "15.08.2026;MIGROS ISTANBUL TR;1.284,35";
    assert.equal(maskSensitiveData(input).text, input);
  });
});

describe("maskSensitiveData — gerçekçi ekstre", () => {
  it("üst bilgi ve işlem satırlarındaki tüm hassas verileri yakalar", () => {
    const input = [
      "Kart Numarası;5528 7912 3456 1234",
      "Ödeme Hesabı IBAN;TR33 0006 1005 1978 6457 8413 26",
      "T.C. Kimlik No;10000000146",
      "18.09.2026;KART NO 5528791234561234 ATM NAKİT AVANS;2.000,00",
      "25.09.2026;EFT ÜCRETİ ALICI TR64 0001 0017 4512 3456 7890 01;8,75",
    ].join("\n");
    const r = maskSensitiveData(input);
    assert.deepEqual(r.report, { cards: 2, ibans: 2, nationalIds: 1 });
    assert.doesNotMatch(r.text, /5528 7912|5528791234|0006 1005|10000000146|0017 4512/);
    assert.match(r.text, /2\.000,00/);
    assert.match(r.text, /8,75/);
  });
});
