import Module from 'manifold-3d';
const w=await Module(); w.setup(); const {Manifold,CrossSection}=w;
const c=CrossSection.square([10,10],true).extrude(20);
let p=Object.getPrototypeOf(c), names=new Set(); while(p&&p!==Object.prototype){Object.getOwnPropertyNames(p).forEach(n=>names.add(n)); p=Object.getPrototypeOf(p);}
console.log([...names].filter(n=>/project|slice|transform|intersect|getMesh|status|genus|volume/.test(n)));
console.log(c.project().area(), c.intersect(c.translate([5,0,0])).volume());
