import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSize, isNewer, isPrivateIPv4, parseUpdateAddress } from "../update-address";

describe("güncelleme adresi doğrulama", () => {
  it("ev ağı adreslerini kabul eder, varsayılan portu ekler", () => {
    assert.deepEqual(parseUpdateAddress("192.168.1.23"), { host: "192.168.1.23", port: 8765, base: "http://192.168.1.23:8765" });
    assert.equal(parseUpdateAddress("  http://10.0.0.5:9000/ ")?.base, "http://10.0.0.5:9000");
    assert.equal(parseUpdateAddress("172.20.1.1:80")?.base, "http://172.20.1.1:80");
  });

  it("internete açık adresleri, alan adlarını ve bozuk girdiyi reddeder", () => {
    for (const bad of ["8.8.8.8", "8.8.8.8:8765", "example.com", "evim.local", "172.32.0.1", "172.15.0.1", "192.169.1.1", "300.1.1.1", "192.168.1.1:0", "192.168.1.1:70000", "192.168.1.1:abc", "", "http://", "192.168.1", "192.168.1.1/../x"]) {
      assert.equal(parseUpdateAddress(bad), null, bad);
    }
  });

  it("özel ağ aralıkları sınırlarda doğru", () => {
    assert.equal(isPrivateIPv4("10.255.255.255"), true);
    assert.equal(isPrivateIPv4("172.16.0.0"), true);
    assert.equal(isPrivateIPv4("172.31.255.255"), true);
    assert.equal(isPrivateIPv4("192.168.0.1"), true);
    assert.equal(isPrivateIPv4("127.0.0.1"), false);
    assert.equal(isPrivateIPv4("169.254.1.1"), false);
  });
});

describe("sürüm karşılaştırma ve boyut", () => {
  it("yalnızca daha büyük versionCode yeni sayılır (aynı/eski sürüme güncelleme önerilmez)", () => {
    assert.equal(isNewer({ versionCode: 3 }, 2), true);
    assert.equal(isNewer({ versionCode: 2 }, 2), false);
    assert.equal(isNewer({ versionCode: 1 }, 2), false);
  });

  it("boyutu okunur yazar", () => {
    assert.match(formatSize(1_845_327), /^1,8 MB$/);
    assert.equal(formatSize(300), "1 KB");
    assert.equal(formatSize(51_200), "50 KB");
  });
});
