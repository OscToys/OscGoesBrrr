import {Fragment, type ReactNode, useEffect, useState} from 'react';
import {ipcRenderer} from "electron";
import {Config, Rule, RuleCondition} from '../../common/configTypes';
import React from 'react';
import {
    type FieldPath,
    type FieldArrayPath,
    FormProvider,
    useFieldArray,
    useForm,
    useFormContext,
    type FieldPathByValue,
    type FieldValues,
    type FieldArray
} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {ErrorMessage} from "@hookform/error-message";
import {DropdownButton, Dropdown, Button, Badge, Toast, ToastContainer, ListGroup} from "react-bootstrap";

export default function Settings() {
    const [loadError, setLoadError] = useState('');
    const form = useForm({
        resolver: zodResolver(Config),
        defaultValues: async () => {
            try {
                return await Config.parseAsync(await ipcRenderer.invoke('config:get'));
            } catch(e) {
                setLoadError(e instanceof Error ? e.message : e+'');
                throw e;
            }
        }
    });
    const {
        control,
        reset,
        register,
        setValue,
        resetField,
        handleSubmit,
        getValues,
        formState: { errors, isValid, isDirty, isSubmitting, dirtyFields, isLoading }
    } = form;
    const { append: appendRule } = useFieldArray({ control: control, name: "rules", });
    const onSubmit = handleSubmit(
        async data => {
            console.log("submit", data);
            await ipcRenderer.invoke('config:set', data);
            reset(data);
        }
    );

    if (loadError) return <>{loadError}</>;
    if (isLoading) return <>Loading configuration ...</>;

    return <FormProvider {...form}><form onSubmit={onSubmit} className="settings"><fieldset disabled={isSubmitting}>
        <h1>Intiface</h1>
        <div>Intiface Server Port or IP:Port</div>
        <Field name="outputs.intiface.address" placeholder="Default: 12345" />

        <h1>VRChat</h1>
        <div>Forward OSC Data to Port or IP:Port</div>
        <FieldArray name="sources.vrchat.proxy" appendText="Add Proxy">{name =>
            <Field name={`${name}.address`} placeholder="Ex: 9002 or 192.168.0.5:9000"/>
        }</FieldArray>

        <h1>Custom Rules</h1>
        <FieldArray name="rules" appendText="Add Rule" appendOptions={[
            ["Multiply Level", {action: {type: "scale"}}],
            ["Vibrate based on movement", {action: {type: "movement"}}],
        ]}>
            {name => <RuleEditor name={name}/>}
        </FieldArray>

        <ToastContainer position="bottom-center"><Toast style={{width:'auto'}} show={isDirty}>
            <Toast.Body>You have unsaved changes <Button as="input" type="submit" variant="success" value="Save" /></Toast.Body>
        </Toast></ToastContainer>
        {Object.keys(errors).length > 0 && <span style={{whiteSpace: 'pre-wrap'}}>
            Error:
        </span>}

    </fieldset></form></FormProvider>;
}

function RuleEditor({name}: {name: FieldPathByValue<Config, Rule>}) {
    const {register, getValues} = useFormContext<Config>();
    const type = getValues(`${name}.action.type`);

    let body;
    if (type == "scale") {
        body = <>Multiply level by <Field name={`${name}.action.scale`} type="number"/></>;
    } else if (type == "movement") {
        body = <>Vibrate based on movement, rather than depth</>;
    }
    return <>
        <ConditionsEditor rulePath={name}/>
        {body}
    </>;
}

function ConditionsEditor({rulePath}: {rulePath: FieldPathByValue<Config, Rule>}) {
    const {register, getValues} = useFormContext<Config>();
    const appendOptions: [string,any][] = [
        ["Source or output contains a tag", {type:'tag'}],
        ["Source or output DOES NOT contain a tag", {type:'notTag'}],
    ];

    const {control} = useFormContext<Config>();
    const conditionsField = useFieldArray({
        control: control,
        name: `${rulePath}.conditions`,
    });

    let conditions;
    if (conditionsField.fields.length == 0) {
        conditions = <Badge>Always</Badge>;
    } else {
        conditions = conditionsField.fields.map((field, index) => {
            const conditionId: FieldPathByValue<Config, RuleCondition> = `${rulePath}.conditions.${index}`
            const conditionType = getValues(`${conditionId}.type`);
            let inner, bg;
            if (conditionType == 'tag') { inner = <><Field name={`${conditionId}.tag`}/></>; bg="success"; }
            else if (conditionType == 'notTag') { inner = <><Field name={`${conditionId}.tag`}/></>; bg="danger"; }
            else { inner = "?"; bg=""; }
            return <Fragment key={index}>
                <Badge bg={bg} style={{verticalAlign: 'middle'}}>
                    {inner}
                    <Button className="remove" size="sm" onClick={() => conditionsField.remove(index)}>
                        X
                    </Button>
                </Badge>
                {' '}
            </Fragment>;
        });
    }
    const addButton = <DropdownButton size="sm" title={"+"}>
        {appendOptions.map(([name,obj]) => <Dropdown.Item key={name} onClick={_ => conditionsField.append(obj)}>{name}</Dropdown.Item>)}
    </DropdownButton>
    return <div className="conditions">When:{' '}{conditions}{' '}{addButton}</div>;
}

function Field({name, placeholder, ...rest}: {
    name: FieldPath<Config>,
    placeholder?: string
} & React.ComponentProps<"input">) {
    const {register, formState: { errors }} = useFormContext<Config>();
    return <>
        <input {...register(name)} placeholder={placeholder} {...rest} />
        <ErrorMessage
            errors={errors}
            name={name}
            render={({ message }) => <div className="error">{message}</div>}
        />
    </>;
}

function FieldArray<P extends FieldArrayPath<Config>>({name, children, appendOptions, appendText, appendObject, emptyElement, allowReordering}: {
    name: P,
    children: (path: `${P}.${number}`) => ReactNode,
    appendOptions?: [string,any][],
    appendText?: string,
    appendObject?: any,
    emptyElement?: ReactNode,
    allowReordering?: boolean
}) {
    const {control} = useFormContext<Config>();
    const {
        fields,
        append,
        move,
        remove
    } = useFieldArray({
        control: control,
        name: name,
    });
    if (!appendText) appendText = "Add";

    let addButton;
    if (appendOptions) {
        addButton = <DropdownButton id="dropdown-basic-button" title={appendText}>
            {appendOptions.map(([name,obj]) => <Dropdown.Item key={name} onClick={_ => append(obj)}>{name}</Dropdown.Item>)}
        </DropdownButton>
    } else {
        addButton = <Button onClick={_ => append(appendObject ?? {})}>{appendText}</Button>
    }

    return <ListGroup>
        {fields.length == 0 && emptyElement && <ListGroup.Item>{emptyElement}</ListGroup.Item>}
        {' '}
        {fields.map((field, index) => {
            return <ListGroup.Item key={field.id}>
                {children(`${name}.${index}`)}
                <div className="corner">
                    {(allowReordering ?? true) && <>
                        <div className="up" onClick={() => index != 0 && move(index, index - 1)}>
                            🡱
                        </div>
                        <div className="down" onClick={() => index != fields.length - 1 && move(index, index + 1)}>
                            🡳
                        </div>
                    </>}
                    <div className="remove" onClick={() => remove(index)}>
                        X
                    </div>
                </div>
            </ListGroup.Item>
        })}
        {addButton}
    </ListGroup>;
}
