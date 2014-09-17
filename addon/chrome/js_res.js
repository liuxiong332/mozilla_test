QUnit.test('test for resource file', function(assert) {
  assert.ok(Components);
  assert.ok(Components.classes);
  assert.ok(Components.interfaces);
  Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
});
