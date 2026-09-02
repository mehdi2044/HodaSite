import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['.next/**','node_modules/**']},{files:['**/*.{ts,tsx}'],languageOptions:{parser:tseslint.parser},rules:{'no-restricted-syntax':['error',{selector:"CallExpression[callee.property.name='toNumber']",message:'Money must remain Decimal.'}]}});
