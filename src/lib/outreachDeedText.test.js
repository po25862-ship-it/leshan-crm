import {parseDeedText, MAX_DEED_TEXT} from './outreachDeedText';
import {hasMailingDoorNumber} from './outreachDeed';

import {deedTextFixture} from './outreachDeedText.fixture';


test('reads the supplied YAML structure, shares and full-width parking number precisely', () => {
  const result = parseDeedText(deedTextFixture);
  expect(result.key).toBe('桃園市/龜山區/測試段/06535000');
  expect(result.details).toMatchObject({propertyAddress:'桃園市龜山區樂善二路193號十一樓',parkingNo:'277',totalFloors:28,floor:'十一層',completedOn:'2020-12-21',material:'鋼筋混凝土造',purpose:'集合住宅'});
  const shared = 48471.82 * 108 / 100000, parking = 48471.82 * 50 / 100000;
  expect(result.details.mainArea).toBeCloseTo(52.28*.3025,7);
  expect(result.details.accessoryArea).toBeCloseTo(7.6*.3025,7);
  expect(result.details.parkingArea).toBeCloseTo(parking*.3025,7);
  expect(result.details.commonArea).toBeCloseTo((shared-parking)*.3025,7);
  expect(result.details.totalArea).toBeCloseTo((52.28+7.6+shared)*.3025,7);
  expect(result.details.netArea).toBeCloseTo((52.28+7.6+shared-parking)*.3025,7);
});
test('preserves owner registration zeroes; partial OCR address is warned and never replaced by bank address', () => {
  const result=parseDeedText(deedTextFixture);
  expect(result.owners).toHaveLength(1);
  expect(result.owners[0]).toMatchObject({key:'0002',maskedName:'王**',address:'桃園市龜山區樂善二路',share:'1/1',selected:false,confirmed:false});
  expect(result.warnings.join('')).toContain('缺少門牌號碼');
  expect(result.deedText).toContain('最高限額抵押權');
  expect(result.details.price).toBeUndefined();
  expect(result.images).toEqual([]);
});
test('supports JSON, complete addresses, multiple distinct owners and numeric square meters', () => {
  const result=parseDeedText(JSON.stringify({'建物標示部':{'建號':'桃園市龜山區測試段06535-000','建物門牌':'桃園市龜山區測試路1號','總面積':52.28},'建物所有權部':[{'登記次序':'0002','所有權人':'王＊＊','地址':'桃園市龜山區測試路1號'},{'登記次序':'0003','所有權人':'王＊＊','地址':'桃園市龜山區測試路2號'}]}));
  expect(result.details.propertyAddress).toBe('桃園市龜山區測試路1號');
  expect(result.details.mainArea).toBeCloseTo(15.8147,6);
  expect(result.owners.map(o=>o.key)).toEqual(['0002','0003']);
  expect(result.warnings.join('')).not.toContain('缺少門牌號碼');
});
test('HTML-looking field values stay text and never become executable markup', () => {
  const result=parseDeedText(deedTextFixture.replace('王＊＊','<img src=x onerror=alert(1)>'));
  expect(result.owners[0].maskedName).toBe('<img src=x onerror=alert(1)>');
  expect(result.owners[0].imageRefs).toEqual([]);
});
test('accepts fenced YAML, but rejects incomplete, mixed-unit and oversized sources', () => {
  expect(parseDeedText('```yaml\n'+deedTextFixture+'\n```').owners[0].key).toBe('0002');
  expect(()=>parseDeedText('案名：測試案件')).toThrow('建物標示部');
  expect(()=>parseDeedText('建物標示部: [')).toThrow('文字格式');
  expect(()=>parseDeedText(deedTextFixture.replace('樂善二路１９３號十一樓',''))).toThrow('建物門牌');
  expect(()=>parseDeedText(deedTextFixture.replace('登記次序: 0002','登記次序:'))).toThrow('登記次序');
  expect(()=>parseDeedText(deedTextFixture.replace('- 登記次序: 0002\n  建號: 桃園市龜山區測試段06535','- 登記次序: 0002\n  建號: 桃園市龜山區測試段06536'))).toThrow('建號不同');
  expect(()=>parseDeedText('x'.repeat(MAX_DEED_TEXT+1))).toThrow('20 萬字');
});
test('does not allow aliases, executable YAML tags, or duplicate fields', () => {
  expect(()=>parseDeedText('a: &alias [1]\nb: *alias')).toThrow('別名');
  expect(()=>parseDeedText('a: !!js/function function(){}')).toThrow('特殊標籤');
  expect(()=>parseDeedText(deedTextFixture+'\n建物標示部: 另一間')).toThrow('文字格式');
});
test('missing and invalid parking allocations remain unknown, not a guessed zero', () => {
  const result=parseDeedText(deedTextFixture.replace('100000分之50','100000分之150'));
  expect(result.details.parkingArea).toBeNull();
  expect(result.details.commonArea).toBeNull();
  expect(result.details.netArea).toBeNull();
});
test('mailing validation accepts full-width and Chinese door numbers but not a street-only address', () => {
  expect(hasMailingDoorNumber('桃園市龜山區樂善二路')).toBe(false);
  expect(hasMailingDoorNumber('桃園市龜山區樂善二路１９３號')).toBe(true);
  expect(hasMailingDoorNumber('測試街一百九十三號')).toBe(true);
});
